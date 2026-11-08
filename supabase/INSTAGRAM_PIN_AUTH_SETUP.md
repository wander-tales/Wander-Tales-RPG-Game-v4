# Instagram PIN authentication setup

This change keeps website registration and Guild Master approval intact. A player must first complete the existing registration page, consent to resident data storage, and be approved. Only then can Instagram DM issue a login PIN.

## 1. Apply the database migration

In Supabase Dashboard, open **SQL Editor**, create a new query, paste the full contents of `supabase/migrations/0003_instagram_pin_auth.sql`, and run it.

The migration adds:
- server-only PIN hashes and Instagram-scoped sender mapping;
- PIN expiry and failed-attempt lockout fields;
- webhook event deduplication;
- an optional Supabase Auth user link on each approved resident.

Do not expose the service-role key in Vercel or browser environment variables.

## 2. Configure Edge Function secrets

In Supabase Dashboard → **Edge Functions → Secrets**, preserve existing `META_VERIFY_TOKEN` and `META_APP_SECRET` values and ensure these secrets exist:

- `META_VERIFY_TOKEN` — the same verification token already configured in Meta.
- `META_APP_SECRET` — the Meta app secret used for webhook HMAC verification.
- `META_ACCESS_TOKEN` — a valid Instagram messaging access token.
- `META_IG_ACCOUNT_ID` — the Instagram professional account ID used as the messages endpoint.
- `META_GRAPH_API_VERSION` — the Graph API version currently supported by your Meta app, formatted like `vXX.X`.
- `PIN_HASH_SECRET` — a new random secret with at least 32 characters. Keep it private and do not reuse the Meta app secret.

Supabase Edge Functions provide `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in their runtime environment. Never put the service-role key in Vercel `VITE_*` variables.

## 3. Deploy the Edge Functions

Deploy the updated `supabase/functions/instagram-webhook/index.ts` to the existing function name **instagram-webhook**. Keep its current callback URL in Meta; do not create a second webhook URL.

Deploy `supabase/functions/player-auth/index.ts` as a new function named **player-auth**.

The player-auth function is a public login endpoint: deploy it with JWT verification disabled at the Supabase gateway (CLI: `supabase functions deploy player-auth --no-verify-jwt`). The function performs its own PIN validation and lockout before issuing a one-time Supabase Auth token. Do not disable webhook signature validation in the webhook source.

If using the Supabase Dashboard editor instead of CLI, turn off **Verify JWT** for `player-auth`. The webhook's existing Meta HMAC validation must remain enabled in code.

## 4. Frontend deployment

The login screen now calls the `player-auth` Edge Function when Supabase mode is active. Vercel must have the existing public variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Redeploy the Vercel project after the branch is merged into the deployment branch. This work is currently on `feature/instagram-pin-auth`, not `main`.

## 5. Expected player flow

1. Player completes the existing website registration and checks the consent box.
2. Guild Master reviews and approves the registration.
3. Player follows `@wandertales.guild` and sends `DAFTAR` by DM.
4. The webhook checks the Instagram sender, approved resident record, and follower list, then sends a six-digit PIN.
5. Player enters Instagram username + PIN on the website.
6. If forgotten, player sends `LUPA PIN` from the same Instagram account to receive a replacement PIN.

PINs expire after 30 days. Five incorrect attempts lock login for 15 minutes. If a follower list is uploaded and the account is no longer on it, player login is denied until the list is updated.

## Important scope note

This patch establishes secure login and Supabase Auth sessions. It does not yet migrate game XP, gold, inventory, class, or quest progress from browser storage into per-player cloud records. Those game-save records need a separate migration before progress is guaranteed to follow a player across browsers/devices. New approved residents currently enter with starter player values.
