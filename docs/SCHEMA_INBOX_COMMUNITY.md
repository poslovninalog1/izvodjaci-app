# Inbox & Community schema (reference)

Used by app code for type assumptions. Confirm in Supabase Table Editor / SQL.

## Community (single_inbox_community_setup.sql or 00014)

| Table.Column            | Type        |
|-------------------------|-------------|
| community_posts.id      | uuid (PK)   |
| community_posts.author_id | uuid (FK profiles) |
| community_posts.created_at | timestamptz |
| community_comments.post_id | uuid (FK community_posts) |

## Inbox (single_inbox_community_setup.sql = UUID; 00014 = bigint)

If you ran **single_inbox_community_setup.sql** (Supabase SQL Editor):

| Table.Column              | Type        |
|---------------------------|-------------|
| conversations.id         | uuid (PK)   |
| conversation_participants.conversation_id | uuid |
| conversation_participants.user_id | uuid |
| messages.id               | uuid (PK)   |
| messages.conversation_id  | uuid        |
| messages.sender_id        | uuid        |

If you only have **migrations 00003/00014** (conversations from 00003):

| Table.Column              | Type        |
|---------------------------|-------------|
| conversations.id         | bigserial   |
| messages.conversation_id  | bigint      |

The app uses **string** for conversation id in URLs and Supabase queries so both uuid and bigint work (PostgREST accepts string for both).
