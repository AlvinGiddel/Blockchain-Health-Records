# Supabase Edge Function: Remote Licensing Server (Kill-Switch)

This directory contains the license authority Edge Function that validates client instance licenses for the Blockchain Health Records (BHC) system.

---

## 🚀 Deployment Instructions

### 1. Run Migration
Apply the database migration to create the `licenses` table in your Supabase project:
```bash
supabase db push
# or execute supabase/migrations/20260901_create_licenses.sql directly in Supabase SQL Editor
```

### 2. Deploy Edge Function
Deploy the `check-license` function without JWT verification (since client BHC backends query this endpoint anonymously with their `client_id`):
```bash
supabase functions deploy check-license --no-verify-jwt
```

---

## 🔑 Edge Function Environment Variables

Supabase Edge Functions automatically inject the following secrets:
- `SUPABASE_URL`: Your Supabase project URL (e.g. `https://xyzproject.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY`: Service role secret key (allows querying the `licenses` table securely)

If developing locally with `supabase start`, configure these in `supabase/.env.local` or pass them via CLI.

---

## 📡 API Usage

### `GET /functions/v1/check-license/:client_id`
Returns the status of the license for the specified `client_id`.

#### Success Response (`active`):
```json
{
  "status": "active",
  "client_id": "bhc-client-001"
}
```

#### Disabled Response (`disabled`):
```json
{
  "status": "disabled",
  "reason": "not_found" // or "expired" | "revoked"
}
```

#### Missing Client ID (`400`):
```json
{
  "error": "client_id is required in the path segment or query string."
}
```
