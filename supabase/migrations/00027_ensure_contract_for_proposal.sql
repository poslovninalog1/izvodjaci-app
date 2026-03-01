-- RPC: ensure_contract_for_proposal
-- Ensures a contract exists for an accepted/hired proposal. Creates one if missing.
-- Returns contract.id (bigint).

create or replace function public.ensure_contract_for_proposal(p_proposal_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id bigint;
  v_freelancer_id uuid;
  v_client_id uuid;
  v_contract_id bigint;
  v_status text;
begin
  select
    p.job_id,
    p.freelancer_id,
    coalesce(p.client_id, j.client_id) as resolved_client_id,
    p.status
  into
    v_job_id,
    v_freelancer_id,
    v_client_id,
    v_status
  from public.proposals p
  left join public.jobs j on j.id = p.job_id
  where p.id = p_proposal_id;

  if not found then
    raise exception 'ensure_contract_for_proposal: proposal_id=% not found in public.proposals', p_proposal_id;
  end if;

  if v_job_id is null or v_freelancer_id is null or v_client_id is null then
    raise exception 'ensure_contract_for_proposal: missing data for proposal_id=% (job_id=%, freelancer_id=%, client_id=%)',
      p_proposal_id, v_job_id, v_freelancer_id, v_client_id;
  end if;

  if lower(coalesce(v_status,'')) not in ('accepted','hired') then
    raise exception 'ensure_contract_for_proposal: proposal_id=% not accepted/hired (status=%)', p_proposal_id, v_status;
  end if;

  select c.id into v_contract_id
  from public.contracts c
  where c.job_id = v_job_id
    and c.freelancer_id = v_freelancer_id
  limit 1;

  if v_contract_id is not null then
    return v_contract_id;
  end if;

  insert into public.contracts(job_id, client_id, freelancer_id, status)
  values (v_job_id, v_client_id, v_freelancer_id, 'active')
  returning id into v_contract_id;

  return v_contract_id;
end;
$$;

grant execute on function public.ensure_contract_for_proposal(bigint) to authenticated;
