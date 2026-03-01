-- Quick sanity: list recent proposals with job_id, freelancer_id, client_id, status
SELECT job_id, freelancer_id, client_id, status
FROM public.proposals
ORDER BY created_at DESC
LIMIT 20;
