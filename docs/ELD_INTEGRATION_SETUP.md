# Zap Dispatch — Multi-ELD Integration Setup

## Current status

The multi-provider ELD foundation is implemented in draft PR #37 with Next Fleet ELD as the first provider.

Backend deployment completed on the Zap Dispatch Supabase project:

- Database migration applied.
- RLS-enabled ELD tables created.
- `eld-gateway` Edge Function deployed with JWT verification enabled.
- `ELD_CREDENTIALS_KEY` configured by the project owner.
- Settings UI is loaded directly by `index.html` in the PR preview.

The PR must remain unmerged until a real Next Fleet connection test succeeds with a newly generated API key.

## Security requirement

A previously displayed Next Fleet API key must be revoked and replaced before testing. Never paste the replacement key into chat, GitHub, source code, screenshots, or browser storage.

The replacement key must be entered only through:

`Zap Dispatch TMS → Settings → ELD Integrations`

The browser sends it once to the authenticated Supabase Edge Function. The function encrypts it with AES-256-GCM before storage. The credential is never returned to the frontend.

## Next Fleet API contract

- Base URL: `https://cloud.nextfleeteld.com`
- Authentication header: `X-Api-Key`
- Drivers: `GET /api/v0/users/drivers`
- GPS devices: `GET /api/v0/devices/gps`
- ELD devices: `GET /api/v0/devices/eld`

## Preview test

1. Open the Cloudflare preview deployment for PR #37.
2. Log in to Zap Dispatch.
3. Open **Settings**.
4. Find **ELD Integrations**.
5. Select the carrier.
6. Select **Next Fleet ELD**.
7. Enter a connection name.
8. Paste the newly generated Next Fleet API key.
9. Press **Test & Connect**.
10. Press **Sync drivers & devices**.
11. Confirm drivers, GPS devices, and ELD devices appear under **View synced data**.

## Supported now

- Multiple ELD connections per dispatcher.
- One connection associated with a specific carrier.
- Secure Next Fleet API-key storage.
- Test connection.
- Sync drivers.
- Sync GPS devices.
- Sync ELD devices.
- View sanitized synchronized records.
- Disconnect and cascade-delete synchronized records.

## Designed for later providers

The database stores a `provider` value and the Edge Function routes provider-specific behavior. Future adapters can add Motive, Samsara, Geotab, Verizon Connect, or other ELDs without changing the frontend data model.

## Not included in this foundation

- Live GPS positions.
- HOS availability.
- Automatic ETA/geofences.
- Automatic load-status changes.
- Background scheduled synchronization.
- Driver-to-load mapping UI.

These should be added after the first Next Fleet connection and response payloads are verified against real account data.

## Do not merge until

- The ELD Integrations card appears in preview.
- Test & Connect succeeds.
- Sync succeeds with real Next Fleet data.
- Existing Loads, Driver Link, invoices, paywall, admin invitations, and driver portal still work normally.
