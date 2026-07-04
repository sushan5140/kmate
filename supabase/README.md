# Supabase setup

## 1. Create a project
Create a new project at supabase.com. From Project Settings -> API, copy the Project URL,
`anon` public key, and `service_role` key into `.env.local` (see `.env.local.example`).

## 2. Enable Google sign-in
Authentication -> Providers -> Google. This requires a Google Cloud Console OAuth
consent screen + an OAuth 2.0 Client ID (type "Web application") with authorized
redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`. Paste the resulting
Client ID/Secret into Supabase's Google provider settings. Also add
`http://localhost:3000` as an authorized JavaScript origin in Google Cloud Console for
local dev.

## 3. Run the schema
Paste the contents of `supabase/schema.sql` into the Supabase SQL Editor and run it.
Safe to re-run any time (every statement is idempotent).

## 4. Seed universities
```
npm run seed:universities
```
Re-run this any time `data/gks-universities.json` changes (NIIED republishes the
official list roughly yearly with each GKS Notice).

## 5. Make yourself an admin
After signing in once for real, set `is_admin = true` on your own row in the Supabase
Table Editor (`profiles` table) -- this is the only way to reach `/admin/questions`,
by design (no admin signup flow).
