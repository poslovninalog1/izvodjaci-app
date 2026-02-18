# Phase 6: Hire → Contracts + Conversations + Inbox

## Files Created

| File | Purpose |
|------|---------|
| `app/contracts/page.tsx` | List contracts (client_id or freelancer_id = auth.uid()); job title, counterpart, status, date |
| `app/contracts/[id]/page.tsx` | Contract detail: job, users, status; "Otvori razgovor" link; "Označi kao završeno" for client |
| `app/inbox/page.tsx` | List conversations with last message snippet, counterpart, job title |
| `app/inbox/[conversationId]/page.tsx` | Chat: messages, send form (max 2000 chars) |
| `supabase/migrations/00010_phase6_rls.sql` | RLS for contracts, conversations, messages |
| `docs/PHASE6-CONTRACTS-INBOX.md` | Phase 6 notes and test steps |

## Files Changed

| File | Changes |
|------|---------|
| `app/client/jobs/[id]/proposals/page.tsx` | Hire: create contract + conversation, update proposal; block if active contract exists; redirect to /contracts/[id] |
| `app/components/SidebarTabs.tsx` | Added "Inbox" and "Ugovori" for logged-in users |

## Migration 00010_phase6_rls.sql

```sql
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contracts_select_participants" ON contracts;
CREATE POLICY "contracts_select_participants" ON contracts
  FOR SELECT USING (client_id = auth.uid() OR freelancer_id = auth.uid());

DROP POLICY IF EXISTS "contracts_insert_client" ON contracts;
CREATE POLICY "contracts_insert_client" ON contracts
  FOR INSERT WITH CHECK (client_id = auth.uid());

DROP POLICY IF EXISTS "contracts_update_participants" ON contracts;
CREATE POLICY "contracts_update_client" ON contracts
  FOR UPDATE USING (client_id = auth.uid());

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
```

## How to Test

### 1) Client hires proposal → contract + conversation → redirect

1. Log in as client, go to /client/jobs/[id]/proposals.
2. Click "Angažuj" on a submitted proposal.
3. Contract and conversation are created, proposal status → hired.
4. Redirect to /contracts/[contractId].

### 2) Both client and freelancer see contract in /contracts

1. Client: /contracts shows the new contract.
2. Freelancer: /contracts shows the same contract.

### 3) Both see conversation in /inbox and can message

1. Client: /inbox shows the conversation; open it and send a message.
2. Freelancer: /inbox shows the conversation; open it and reply.
3. Messages appear for both.

### 4) Client completes contract

1. Client opens /contracts/[id].
2. Clicks "Označi kao završeno".
3. Status → completed, completed_at set.

### 5) RLS verification

- Outsider cannot read contracts/conversations/messages.
- Only participants (client or freelancer) can read and write.
