-- =============================================================================
-- Phase 6: Contracts, Conversations, Messages RLS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- CONTRACTS
-- -----------------------------------------------------------------------------
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contracts_select_participants" ON contracts;
CREATE POLICY "contracts_select_participants" ON contracts
  FOR SELECT USING (
    client_id = auth.uid() OR freelancer_id = auth.uid()
  );

DROP POLICY IF EXISTS "contracts_insert_client" ON contracts;
CREATE POLICY "contracts_insert_client" ON contracts
  FOR INSERT WITH CHECK (client_id = auth.uid());

-- MVP: only client can update (complete/cancel)
DROP POLICY IF EXISTS "contracts_update_participants" ON contracts;
CREATE POLICY "contracts_update_client" ON contracts
  FOR UPDATE USING (client_id = auth.uid());

-- -----------------------------------------------------------------------------
-- CONVERSATIONS
-- -----------------------------------------------------------------------------
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversations_select_participants" ON conversations;
CREATE POLICY "conversations_select_participants" ON conversations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM contracts c
      WHERE c.id = conversations.contract_id
      AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "conversations_insert_participants" ON conversations;
CREATE POLICY "conversations_insert_client" ON conversations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM contracts c
      WHERE c.id = conversations.contract_id
      AND c.client_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- MESSAGES
-- -----------------------------------------------------------------------------
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select_participants" ON messages;
CREATE POLICY "messages_select_participants" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations conv
      JOIN contracts c ON c.id = conv.contract_id
      WHERE conv.id = messages.conversation_id
      AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "messages_insert_participants" ON messages;
CREATE POLICY "messages_insert_participants" ON messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM conversations conv
      JOIN contracts c ON c.id = conv.contract_id
      WHERE conv.id = messages.conversation_id
      AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
    )
  );
