# Zap Dispatch — Multi-ELD Integration

## Production status

The provider-neutral ELD foundation is live in production. Next Fleet ELD is verified in production, and the Apollo ELD adapter supports connection testing, drivers, assets, and HOS clocks.

Completed:

- PR #37 merged to `main`.
- Database migrations applied to the Zap Dispatch Supabase project.
- RLS-enabled ELD tables created.
- `eld-gateway` and `eld-hos` Edge Functions deployed and active.
- `ELD_CREDENTIALS_KEY` configured as a Supabase secret.
- Settings → ELD Integrations available in production.
- Real Next Fleet connection, driver/device sync, and HOS clocks verified.

## Security model

ELD API keys must never be pasted into chat, committed to GitHub, included in screenshots, or stored in browser localStorage.

Keys are entered only through:

`Zap Dispatch TMS → Settings → ELD Integrations`

The browser sends the key once over HTTPS. The Edge Function validates the signed-in Supabase user inside the function, encrypts the key using AES-256-GCM, and stores only ciphertext plus IV. The API key is never returned to the frontend.

The Edge Functions allow browser preflight requests and perform their own bearer-token validation before reading or changing user data.

## Next Fleet API contract

Base URL: `https://cloud.nextfleeteld.com`

Authentication header: `X-Api-Key`

Supported endpoints:

- Drivers: `GET /api/v0/users/drivers`
- GPS devices: `GET /api/v0/devices/gps`
- ELD devices: `GET /api/v0/devices/eld`
- HOS driver clocks: `GET /api/v0/driverProfiles`

The HOS endpoint returns values in minutes, including:

- `breakTime`
- `driveTime`
- `shiftTime`
- `cycleTime`
- `cycleTomorrowTime`
- `dutyStatus`
- `driverName`
- `vehicleId`

Zap Dispatch converts the minute values to `hours:minutes` for the Dashboard.

## Apollo ELD API contract

Base URL: `https://content.eldroadmap.com:9103`

Authentication field: `HOSClientApiKey` in the server-to-server HTTPS query.

Supported endpoints:

- Drivers: `GET /HOSDriver/v2.0/GetHOSDriversForClient`
- Assets: `GET /HOSAsset/v2.0/GetHOSAssetsForClient`
- HOS clocks: `GET /HOSDashboard/v2.0/GetHoursOfServiceByDriverForClient`

Apollo returns drive, on-duty shift, and weekly-cycle clocks as elapsed/remaining strings. Zap Dispatch stores and displays the remaining value. Apollo credentials use the same AES-256-GCM encrypted storage as Next Fleet credentials.

See `docs/APOLLO_ELD.md` for the integration-specific mapping and verification checklist.

## Supported now

- Multiple ELD connections per dispatcher.
- One connection associated with a specific carrier.
- Secure Next Fleet and Apollo API-key storage.
- Connection testing.
- Driver synchronization.
- GPS-device synchronization.
- ELD-device synchronization.
- Dashboard driver selector.
- Current duty status.
- Until Break clock.
- Drive clock.
- Shift clock.
- Cycle clock.
- Cycle Tomorrow clock.
- Sanitized synchronized-data viewer.
- Disconnect and cascade-delete synchronized records.

## Production verification

Verified with real Next Fleet data:

- Driver: Princeton Javon Porter
- Vehicle: 1
- Duty status: Sleeper
- Until Break: 8:00
- Drive: 11:00
- Shift: 14:00
- Cycle: 29:50
- Cycle Tomorrow: 33:58

Do not place real API keys, encrypted credentials, phone numbers, or full driver payloads in documentation or issue comments.

## Future providers

The database stores a `provider` value and the backend routes provider-specific behavior. Future adapters may add Motive, Samsara, Geotab, Verizon Connect, Azuga, or other providers without replacing the frontend data model.

## Next phase

Planned after the production stabilization check:

- Current vehicle GPS position.
- Map display.
- Last-location timestamp.
- Driver-to-load mapping.
- ETA and geofences.
- Background synchronization.
- Optional automatic load-status updates.

Location work must use an official Next Fleet Open API endpoint. Do not reuse browser cookies or private portal-session endpoints.
