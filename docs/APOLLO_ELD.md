# Apollo ELD integration

## What Zap Dispatch imports

- Active and inactive Apollo drivers.
- Apollo assets/units as ELD devices.
- Current driver duty status.
- Remaining drive time.
- Remaining on-duty shift time.
- Remaining weekly-cycle time.
- Time until the next 30-minute break when Apollo supplies a future timestamp.
- Apollo's last HOS update timestamp.

Apollo does not use the Next Fleet GPS-location adapter. The Vehicle Location card intentionally queries only Next Fleet connections until an official Apollo latitude/longitude endpoint is implemented and verified.

## Secure setup

1. Request a `HOSClientApiKey` from Apollo ELD or the fleet's Apollo reseller.
2. Open Zap Dispatch TMS.
3. Go to **Settings → ELD Integrations**.
4. Select **Apollo ELD**.
5. Choose the carrier and enter a connection name.
6. Paste the API key into the password field and select **Test & Connect**.
7. Use **Sync drivers, devices & HOS** after the connection succeeds.

Never paste the Apollo key into chat, screenshots, documentation, source code, or GitHub. Zap Dispatch sends it once over HTTPS, encrypts it server-side with AES-256-GCM, and never returns it to the browser.

## API mapping

| Zap Dispatch field | Apollo source |
| --- | --- |
| Driver ID | `HOSDriverId` |
| Driver name | `DriverName`/`Name` + `DriverLastName`/`LastName` |
| Unit number | `Number` |
| ELD asset ID | `AssetId` |
| Duty status | `CurrentDutyStatus` |
| Drive remaining | Remaining portion of `DrivingString` |
| Shift remaining | Remaining portion of `OnDutyString` |
| Cycle remaining | Remaining portion of `OnDutyWeekString` |
| Break remaining | Calculated from `Next30BreakTimestamp` |
| Last activity | `LastUpdateTimestamp` |

Raw Apollo records are sanitized before storage. Credential and password fields are discarded.

## Verification checklist

- Connection test succeeds with a real client key.
- Driver count agrees with Apollo.
- Asset/unit count agrees with Apollo.
- A driver's duty status agrees with Apollo.
- Drive, shift, and cycle clocks agree with Apollo.
- Next Fleet connections continue to sync and show vehicle locations.
