# Zap Dispatch — Multi-ELD foundation

This branch adds a provider-neutral ELD foundation and implements Next Fleet ELD as the first provider.

## Confirmed Next Fleet API contract

- Base URL: `https://cloud.nextfleeteld.com`
- Authentication header: `X-Api-Key`
- Drivers: `GET /api/v0/users/drivers`
- GPS devices: `GET /api/v0/devices/gps`
- ELD devices: `GET /api/v0/devices/eld`

## Security model

The API key is never stored in `localStorage`, returned to the browser, or committed to GitHub.
The browser sends it once over HTTPS to `eld-gateway`. The Edge Function validates the user's Supabase JWT, tests the key, encrypts it with AES-256-GCM, and stores only ciphertext plus IV.

## Required Supabase secret

Generate a random 32-byte key and store the base64 value as:

```text
ELD_CREDENTIALS_KEY
```

Example generation (run locally, never commit the output):

```bash
openssl rand -base64 32
```

The function also relies on the standard Edge Function environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Deployment order

1. Apply `supabase/migrations/20260715210000_multi_eld_foundation.sql`.
2. Add the `ELD_CREDENTIALS_KEY` Edge Function secret.
3. Deploy `supabase/functions/eld-gateway` with JWT verification enabled.
4. Deploy the Cloudflare preview for this branch.
5. In Settings → ELD Integrations, select a carrier, enter a connection name and the Next Fleet API key, then use **Test & Connect**.
6. Press **Sync drivers & devices** and verify the counts and synced records.

## Supported now

- Multiple ELD connections per dispatcher
- One connection associated with a specific carrier
- Secure Next Fleet API-key storage
- Test connection
- Sync drivers
- Sync GPS devices
- Sync ELD devices
- View sanitized synchronized records
- Disconnect and cascade-delete synchronized records

## Designed for later providers

The database stores a `provider` value and the Edge Function routes provider-specific behavior. Future adapters can add Motive, Samsara, Geotab, Verizon Connect, or other ELDs without changing the frontend data model.

## Not included in this foundation

- Live GPS positions (requires the location/telemetry endpoint from each provider)
- HOS availability
- Automatic ETA/geofences
- Automatic load-status changes
- Background scheduled synchronization
- Driver-to-load mapping UI

Those should be added after the first Next Fleet connection and response payloads are verified against real account data.
