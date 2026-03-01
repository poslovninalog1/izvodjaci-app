-- =============================================================================
-- Contract Evidence Pack: contract_documents, contract_audit_log,
-- helper function is_contract_party, RPCs, and RLS policies.
-- =============================================================================

-- ─── Tables ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contract_documents (
  id          bigserial    PRIMARY KEY,
  contract_id bigint       NOT NULL REFERENCES public.contracts(id) ON DELETE RESTRICT,
  version     int          NOT NULL,
  pdf_bucket  text         NOT NULL,
  pdf_path    text         NOT NULL,
  pdf_sha256  text         NOT NULL,
  uploaded_by uuid         NOT NULL REFERENCES auth.users(id),
  uploaded_at timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (contract_id, version)
);

CREATE INDEX IF NOT EXISTS idx_contract_documents_contract
  ON public.contract_documents (contract_id);

CREATE TABLE IF NOT EXISTS public.contract_audit_log (
  id           bigserial    PRIMARY KEY,
  contract_id  bigint       NOT NULL REFERENCES public.contracts(id) ON DELETE RESTRICT,
  action_type  text         NOT NULL,
  performed_by uuid         REFERENCES auth.users(id),
  ip_address   text,
  user_agent   text,
  metadata     jsonb        DEFAULT '{}'::jsonb,
  occurred_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_audit_log_contract
  ON public.contract_audit_log (contract_id, occurred_at DESC);

-- ─── Helper: is_contract_party ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_contract_party(p_contract_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contracts
    WHERE id = p_contract_id
      AND (client_id = auth.uid() OR freelancer_id = auth.uid())
  );
$$;

-- ─── Helper: log_contract_event (internal, called by RPCs) ──────────────────

CREATE OR REPLACE FUNCTION public.log_contract_event(
  p_contract_id  bigint,
  p_action_type  text,
  p_performed_by uuid,
  p_ip           text DEFAULT NULL,
  p_user_agent   text DEFAULT NULL,
  p_metadata     jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.contract_audit_log
    (contract_id, action_type, performed_by, ip_address, user_agent, metadata)
  VALUES
    (p_contract_id, p_action_type, p_performed_by, p_ip, p_user_agent, p_metadata);
END;
$$;

-- ─── RPC: accept_contract_with_document ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.accept_contract_with_document(
  p_contract_id  bigint,
  p_version      int,
  p_pdf_bucket   text,
  p_pdf_path     text,
  p_pdf_sha256   text,
  p_ip           text DEFAULT NULL,
  p_user_agent   text DEFAULT NULL,
  p_tos_version  text DEFAULT NULL,
  p_tos_sha256   text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Caller must be a party to this contract
  IF NOT public.is_contract_party(p_contract_id) THEN
    RAISE EXCEPTION 'Not a party to this contract';
  END IF;

  -- Insert document record (unique constraint prevents duplicate version)
  INSERT INTO public.contract_documents
    (contract_id, version, pdf_bucket, pdf_path, pdf_sha256, uploaded_by)
  VALUES
    (p_contract_id, p_version, p_pdf_bucket, p_pdf_path, p_pdf_sha256, v_uid);

  -- Log the acceptance event
  PERFORM public.log_contract_event(
    p_contract_id,
    'contract_accepted',
    v_uid,
    p_ip,
    p_user_agent,
    jsonb_build_object(
      'version', p_version,
      'pdf_path', p_pdf_path,
      'pdf_sha256', p_pdf_sha256,
      'tos_version', p_tos_version,
      'tos_sha256', p_tos_sha256
    )
  );
END;
$$;

-- ─── RPC: log_contract_download ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_contract_download(
  p_contract_id bigint,
  p_version     int,
  p_ip          text DEFAULT NULL,
  p_user_agent  text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_contract_party(p_contract_id) THEN
    RAISE EXCEPTION 'Not a party to this contract';
  END IF;

  PERFORM public.log_contract_event(
    p_contract_id,
    'pdf_downloaded',
    auth.uid(),
    p_ip,
    p_user_agent,
    jsonb_build_object('version', p_version)
  );
END;
$$;

-- ─── RLS: contract_documents ────────────────────────────────────────────────

ALTER TABLE public.contract_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cd_select_party" ON public.contract_documents
  FOR SELECT USING (public.is_contract_party(contract_id));

CREATE POLICY "cd_deny_insert" ON public.contract_documents
  FOR INSERT WITH CHECK (false);

CREATE POLICY "cd_deny_update" ON public.contract_documents
  FOR UPDATE USING (false);

CREATE POLICY "cd_deny_delete" ON public.contract_documents
  FOR DELETE USING (false);

-- ─── RLS: contract_audit_log ────────────────────────────────────────────────

ALTER TABLE public.contract_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cal_select_party" ON public.contract_audit_log
  FOR SELECT USING (public.is_contract_party(contract_id));

CREATE POLICY "cal_deny_insert" ON public.contract_audit_log
  FOR INSERT WITH CHECK (false);

CREATE POLICY "cal_deny_update" ON public.contract_audit_log
  FOR UPDATE USING (false);

CREATE POLICY "cal_deny_delete" ON public.contract_audit_log
  FOR DELETE USING (false);

-- ─── Grants ─────────────────────────────────────────────────────────────────

GRANT SELECT ON public.contract_documents TO authenticated;
GRANT SELECT ON public.contract_audit_log TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_contract_party(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_contract_with_document(bigint, int, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_contract_download(bigint, int, text, text) TO authenticated;
