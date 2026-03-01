-- =============================================================================
-- Fix: contracts.started_at (42703), ensure_contract_for_proposal UUID, trigger
-- =============================================================================

-- 1) Add contracts.started_at if missing (fixes Supabase error 42703)
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS started_at timestamptz DEFAULT now();

-- Backfill: if column existed but some rows have NULL, or if created_at exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contracts' AND column_name = 'created_at'
  ) THEN
    UPDATE public.contracts SET started_at = COALESCE(started_at, created_at, now()) WHERE started_at IS NULL;
  ELSE
    UPDATE public.contracts SET started_at = COALESCE(started_at, now()) WHERE started_at IS NULL;
  END IF;
END;
$$;

-- 2) Unique constraint on contracts (job_id, freelancer_id) if missing
CREATE UNIQUE INDEX IF NOT EXISTS contracts_job_freelancer_uniq
  ON public.contracts (job_id, freelancer_id);

-- 3) ensure_contract_for_proposal: v_job_id uuid (job_id is UUID in proposals/contracts/jobs)
CREATE OR REPLACE FUNCTION public.ensure_contract_for_proposal(p_proposal_id bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id uuid;
  v_freelancer_id uuid;
  v_client_id uuid;
  v_contract_id bigint;
  v_status text;
BEGIN
  SELECT
    p.job_id,
    p.freelancer_id,
    coalesce(p.client_id, j.client_id),
    p.status
  INTO
    v_job_id,
    v_freelancer_id,
    v_client_id,
    v_status
  FROM public.proposals p
  LEFT JOIN public.jobs j ON j.id = p.job_id
  WHERE p.id = p_proposal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ensure_contract_for_proposal: proposal_id=% not found in public.proposals', p_proposal_id;
  END IF;

  IF v_job_id IS NULL OR v_freelancer_id IS NULL OR v_client_id IS NULL THEN
    RAISE EXCEPTION 'ensure_contract_for_proposal: missing data for proposal_id=% (job_id=%, freelancer_id=%, client_id=%)',
      p_proposal_id, v_job_id, v_freelancer_id, v_client_id;
  END IF;

  IF lower(coalesce(v_status, '')) NOT IN ('accepted', 'hired') THEN
    RAISE EXCEPTION 'ensure_contract_for_proposal: proposal_id=% not accepted/hired (status=%)', p_proposal_id, v_status;
  END IF;

  -- Insert or get existing; populate started_at
  INSERT INTO public.contracts (job_id, client_id, freelancer_id, status, started_at)
  VALUES (v_job_id, v_client_id, v_freelancer_id, 'active', now())
  ON CONFLICT (job_id, freelancer_id) DO UPDATE SET status = contracts.status
  RETURNING id INTO v_contract_id;

  RETURN v_contract_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_contract_for_proposal(bigint) TO authenticated;

-- 4) Trigger: fire on INSERT or UPDATE when status ∈ {accepted, hired}
CREATE OR REPLACE FUNCTION public.trg_ensure_contract_on_proposal_accepted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(coalesce(NEW.status, '')) IN ('accepted', 'hired')
     AND (TG_OP = 'INSERT' OR lower(coalesce(OLD.status, '')) IS DISTINCT FROM lower(coalesce(NEW.status, ''))) THEN
    PERFORM public.ensure_contract_for_proposal(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proposals_ensure_contract ON public.proposals;
CREATE TRIGGER trg_proposals_ensure_contract
  AFTER INSERT OR UPDATE OF status ON public.proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_ensure_contract_on_proposal_accepted();

-- 5) Backfill: ensure contract for all accepted/hired proposals without one
DO $$
DECLARE
  r RECORD;
  v_contract_id bigint;
BEGIN
  FOR r IN
    SELECT p.id
    FROM public.proposals p
    WHERE lower(coalesce(p.status, '')) IN ('accepted', 'hired')
      AND NOT EXISTS (
        SELECT 1 FROM public.contracts c
        WHERE c.job_id = p.job_id AND c.freelancer_id = p.freelancer_id
      )
  LOOP
    BEGIN
      v_contract_id := public.ensure_contract_for_proposal(r.id);
      RAISE NOTICE 'Backfill: proposal_id=% -> contract_id=%', r.id, v_contract_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Backfill failed for proposal_id=%: %', r.id, SQLERRM;
    END;
  END LOOP;
END;
$$;
