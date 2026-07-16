# Next Fleet vehicle location integration

## Official API contract

Zap Dispatch uses the official Next Fleet Open API endpoint:

- All latest vehicle positions: `GET /api/v0/locations`
- One latest vehicle position: `GET /api/v0/locations/{vehicleId}`
- Authentication: `X-Api-Key`

The all-vehicle response contains a `vehicles` array. Supported fields include:

- `id`
- `vehicleId`
- `driverID`
- `latitude`
- `longitude`
- `speed`
- `bearing`
- `fuel`
- `odometer`
- `engineHours`
- `locationTime`
- `timeZoneOffset`
- `geoCodedLocation`

## Zap Dispatch implementation

- Edge Function: `eld-location`
- Database table: `eld_vehicle_locations`
- Frontend module: `eld-location.js`
- Dashboard card: **Vehicle Location**

API credentials remain encrypted in `eld_connections`. The frontend never receives the Next Fleet API key. The Edge Function decrypts it only long enough to call Next Fleet from the server.

The dashboard displays the latest saved position, address, coordinates, reported speed, odometer, engine hours, and a Google Maps link.

## Test flow

1. Open the feature preview.
2. Log in to Zap Dispatch.
3. Open **Home**.
4. Press **Refresh Location**.
5. Confirm the vehicle, address, coordinates, and last report time appear.
6. Open the Google Maps link and confirm the marker matches the Next Fleet portal.

Do not merge until the real location response has been verified and existing HOS, Loads, Driver Link, invoices, paywall, and portal behavior remain normal.
