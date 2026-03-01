-- =============================================================================
-- Sanity check: proposals accepted/hired, contracts, ensure_contract_for_proposal
-- Run in Supabase SQL Editor or psql
-- =============================================================================

-- a) Proposals with status accepted or hired
SELECT 'Proposals accepted/hired:' AS section;
SELECT id, job_id, freelancer_id, client_id, status, created_at
FROM public.proposals
WHERE lower(coalesce(status, '')) IN ('accepted', 'hired')
ORDER BY created_at DESC;

-- b) Proposals accepted/hired WITHOUT a matching contract (missing contracts)
SELECT 'Proposals without contract (need ensure):' AS section;
SELECT p.id AS proposal_id, p.job_id, p.freelancer_id, p.client_id, p.status
FROM public.proposals p
WHERE lower(coalesce(p.status, '')) IN ('accepted', 'hired')
  AND NOT EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.job_id = p.job_id AND c.freelancer_id = p.freelancer_id
  )
ORDER BY p.created_at DESC;

-- c) All contracts
SELECT 'Contracts list:' AS section;
SELECT id, job_id, client_id, freelancer_id, status, started_at
FROM public.contracts
ORDER BY started_at DESC;

-- d) Test ensure_contract_for_proposal for last accepted/hired proposal
SELECT 'Test ensure_contract_for_proposal (last accepted/hired):' AS section;
DO $$
DECLARE
  v_proposal_id bigint;
  v_contract_id bigint;
BEGIN
  SELECT id INTO v_proposal_id
  FROM public.proposals
  WHERE lower(coalesce(status, '')) IN ('accepted', 'hired')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_proposal_id IS NOT NULL THEN
    v_contract_id := public.ensure_contract_for_proposal(v_proposal_id);
    RAISE NOTICE 'ensure_contract_for_proposal(proposal_id=%) -> contract_id=%', v_proposal_id, v_contract_id;
  ELSE
    RAISE NOTICE 'No accepted/hired proposals found to test.';
  END IF;
END;
$$;
