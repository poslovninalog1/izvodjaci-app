# Inbox privacy fix – dev policies removed + defensive UI

## SQL applied

Run in Supabase SQL Editor (or psql):

```sql
DROP POLICY IF EXISTS "conversations_dev" ON public.conversations;
DROP POLICY IF EXISTS "messages_dev" ON public.messages;
```

Or apply the migration file: `supabase/migrations/00021_drop_inbox_dev_policies.sql`.

**Verify** that only membership-based policies remain:

```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('conversations', 'messages');
```

You should see only policies that restrict by `conversation_participants` (e.g. `conversations_select_participants`, `messages_select_participants`), not policies with `qual = (auth.uid() IS NOT NULL)` for ALL.

---

## Code patch (graceful “no access” handling)

- **`app/inbox/[conversationId]/page.tsx`**
  - After fetching conversation metadata, if the result is **null/empty**, the page shows **“Not found or no access.”** (and link back to inbox or “Započni novi razgovor” where appropriate).
  - In **dev mode**, at the start of the fetch we log **auth user id** and **conversationId**:  
    `console.debug("[inbox conversation] fetch start", { authUserId: uid, conversationId });`  
    so you can confirm session identity when debugging.
  - Inbox uses the **normal Supabase client** from `@/src/lib/supabaseClient` (created with `NEXT_PUBLIC_SUPABASE_ANON_KEY`), not service_role, so RLS is enforced.

---

## Potential reasons user could still see wrong chats

1. **Dev RLS policy still exists**  
   `conversations_dev` or `messages_dev` with `qual = (auth.uid() IS NOT NULL)` allows any logged-in user to read all rows and overrides membership policies. **Fix:** drop these policies (SQL above).

2. **View created without `security_invoker = true`**  
   If `v_inbox_threads` (or any view used for inbox) is created with `security_invoker = false`, it runs with definer rights and can bypass RLS. **Fix:** recreate the view with `WITH (security_invoker = true)` so RLS applies when the view is queried.

3. **Server-side Supabase client uses service key**  
   If server code (API routes, server components, getServerSideProps) uses `createClient(url, service_role_key)`, that client bypasses RLS and can read all conversations/messages. **Fix:** use the anon key (or a role that respects RLS) for user-facing inbox; reserve service_role only for trusted backend tasks.

4. **conversation_participants not enforced or not used in SELECT**  
   If RLS on `conversations` / `messages` does not require the user to be in `conversation_participants` (or equivalent membership table), users can see conversations they are not part of. **Fix:** ensure SELECT policies use something like  
   `EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = conversations.id AND cp.user_id = auth.uid())`  
   (and similarly for messages via conversation_id).

---

## Manual test steps (3 users: A/B conversation, C must not see it)

1. **Setup**
   - Create or use 3 test users: **A**, **B**, **C** (e.g. three different browsers or incognito sessions).
   - As **A** and **B**, ensure they have at least one shared conversation (e.g. create a contract between A and B so a contract conversation exists, or start a direct conversation between A and B).
   - Note the **conversation id** of that A–B conversation (e.g. from URL when A or B is in that chat: `/inbox/123` → id = 123).

2. **C must not see A–B conversation in list**
   - Log in as **C**.
   - Open **Inbox** (e.g. `/inbox`).
   - **Expected:** The A–B conversation must **not** appear in the sidebar/list.
   - If C sees it, RLS or the inbox view is still too permissive (check dev policies, view `security_invoker`, and that client uses anon key).

3. **C must not see A–B conversation via direct URL**
   - Still as **C**, open the direct URL of the A–B conversation: `/inbox/[conversationId]` (use the id from step 1).
   - **Expected:** Page shows **“Not found or no access.”** (or equivalent), and C does not see any messages of that conversation.
   - In dev, check console for `[inbox conversation] fetch start` with `authUserId: C’s id` and `conversationId: ...` to confirm session identity.

4. **A and B still see the conversation**
   - Log in as **A**, go to Inbox, open the same conversation.
   - **Expected:** A sees the conversation and messages.
   - Repeat as **B**: B also sees the conversation and messages.

5. **Optional: verify policies**
   - In Supabase SQL Editor, run the `SELECT ... FROM pg_policies` query above and confirm there are no `conversations_dev` / `messages_dev` and that remaining policies are membership-based.
