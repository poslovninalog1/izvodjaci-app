-- Ensure contracts SELECT is allowed for client and freelancer (participants).
-- Required so inbox conversation page can fetch contract details in a separate
-- query when conversation.contract_id is set, without failing on DMs.
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contracts_select_participants" ON contracts;
CREATE POLICY "contracts_select_participants" ON contracts
  FOR SELECT USING (
    client_id = auth.uid() OR freelancer_id = auth.uid()
  );
