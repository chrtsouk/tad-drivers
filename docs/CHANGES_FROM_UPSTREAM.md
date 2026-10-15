# Changes from upstream (fleetbase/navigator-app @ 37af1ee)

Baseline = the commit `Import upstream fleetbase/navigator-app @ 37af1ee`. Regenerate the exact list any time with
`git diff --name-status f0614ce HEAD`.

## Added (new code, in `src/platform/` plus screens/components styled with the app's own Tamagui theme)

| File | Purpose |
|---|---|
| `src/platform/client.ts` | Platform API client (Bearer token, timeout, error mapping, no `force` on run start) |
| `src/platform/errors.ts`, `types.ts` | `PlatformError`, response types |
| `src/platform/settings.ts`, `secureStorage.ts` | Address + token settings; token in Android Keystore (react-native-keychain), address in MMKV |
| `src/platform/scanFlow.ts` | `ScanSession` state machine and bag-code parsing for Collect orders |
| `src/platform/shift.ts` | Shift timer formatting (zone-less timestamps are UTC) |
| `src/platform/failure.ts` | Failed-delivery reasons and photo (JPEG data URL, 3 MB) validation |
| `src/platform/deliveries.ts` | Match Fleetbase order to platform order |
| `src/platform/notifications.ts` | 20 s notification poller, dedupe, mark read |
| `src/platform/PlatformContext.tsx` | Provider: settings, clock state, run, polling, banner, local notification, haptics |
| `src/platform/brand.ts` | Name and privacy-policy URL constants |
| `src/components/ClockInCard.tsx` | Clock in/out control |
| `src/components/PlatformNotificationBanner.tsx` | In-app banner for run notifications |
| `src/components/PlatformDeliveryActions.tsx` | Delivered / Failed (reason picker, photo) |
| `src/screens/CollectOrdersScreen.tsx` | Collect orders (scan, manual entry, wrong-bag screen, Start run) |
| `src/screens/ShiftScreen.tsx` | Dedicated clock screen |
| `src/screens/PlatformSettingsScreen.tsx` | Account > TAD platform |
| `__tests__/platform-*.ts(x)` | Client, scan flow, settings, poller, failure, timer tests (mocked fetch) and UI render tests |
| `tsconfig.platform.json` | Strict typecheck of `src/platform/**/*.ts` and its tests (`yarn typecheck`) |
| `.github/workflows/ci.yml` | Typecheck + jest |
| `assets/tad-logo.png`, `tad-logo-small.png`, `assets/brand/*` | Texas After Dark logos (copied from the platform's `web/public/brand`) |
| `android/app/src/debug/res/xml/network_security_config.xml` | Cleartext allowed for debug builds only |
| `docs/BUILD_ANDROID.md`, `docs/CHANGES_FROM_UPSTREAM.md`, `UPSTREAM.md`, `README.md` | Docs |

## Modified

| File | Change |
|---|---|
| `App.tsx` | Wrap in `PlatformProvider` |
| `src/navigation/DriverNavigator.tsx` | New `Collect` tab (badge = bags still to scan), `Shift` screen under Home, `PlatformSettings` under Account; Dash tab renamed Home, Reports tab renamed Issues; header shows TAD logo and "TAD Drivers"; fuel-report screens removed |
| `config/default.js` | Default tab list includes `DriverCollectTab` |
| `src/screens/DriverDashboardScreen.tsx` | Clock card and shortcuts on top of the existing widgets |
| `src/screens/OrderScreen.tsx` | Delivered/Failed block; calls the platform "delivered" endpoint after Fleetbase completes the order; removed unused order-total/items imports |
| `src/layouts/DriverLayout.tsx` | Mounts the notification banner; opens Collect when a TAD notification is tapped |
| `src/contexts/AuthContext.tsx` | Logout also removes the platform token |
| `src/screens/DriverProfileScreen.tsx` | "TAD platform" menu entry with status |
| `src/screens/DriverReportScreen.tsx` | Issues only (fuel reports removed) |
| `src/screens/LoginScreen.tsx` | TAD logo |
| `src/screens/LocationPermissionScreen.tsx`, `src/contexts/LocationContext.tsx`, `translations/en.json`, `__tests__/LocationPermissionScreen-test.js` | Location disclosure text and privacy-policy URL are TAD's |
| `src/components/OrderPayloadEntities.tsx` | Item price line removed |
| `src/utils/math.js`, `src/constants/Enums.ts` | Tip calculation and fuel-report enums removed |
| `__tests__/App-test.js` | Mock the new provider |
| `package.json` | Jest ignore path, `typecheck` script (dependencies and name unchanged so `yarn.lock` still matches) |
| `.env.example`, `.gitignore` | TAD config, `!.env.example`, `.tmp-test/` |
| `android/app/build.gradle` | Default app name `TAD Drivers`, applicationId `uk.co.texasafterdark.drivers`, link scheme `tadrivers` |
| `android/app/src/main/res/xml/network_security_config.xml` | `cleartextTrafficPermitted="false"` for release |
| `android/app/src/{main,debug}/res/mipmap-*`, `drawable/ic_notification.png`, `notification_icon.png`, `bootsplash_logo.png` | Regenerated from the TAD icon/splash with upstream's own scripts |
| `assets/app-icon.png`, `splash-screen.png`, `play-store-app-icon.png` | TAD artwork |

## Removed

| Path | Why |
|---|---|
| `src/components/OrderTotal.tsx`, `OrderItems.tsx`, `MoneyPercentAdjuster.tsx`, `MoneyInput.tsx` | Order totals, tips, item prices, money inputs (online payment only) |
| `src/screens/CreateFuelReportScreen.tsx`, `EditFuelReportScreen.tsx`, `FuelReportScreen.tsx`, `src/components/FuelReportForm.tsx` | Fuel-report cost/expense feature |
| `src/navigation/stacks/OrderStack.tsx` | Unused and broken upstream (imported a missing screen) |
| `src/legacy/` and top-level `legacy/` | Upstream's previous app generation, not imported by the app; contained the Wallet screen and cash/earnings code |
| `assets/icon.png`, `navigator-icon-transparent.png`, `play-store-feature-image.png` | Navigator artwork |
| `.github/workflows/release.yml`, `create-release.yml`, `react-native-ci.yml`, `RELEASE.md` | Fleetbase's release process and CI (needs their reusable workflow and secrets) |

## Not changed

Navigator's maps, navigation hand-off, order screens, proof of delivery (photo, signature, QR against Fleetbase), chat, issues,
Fleetbase login, location tracking, theme and components. The npm package name is still `@fleetbase/navigator-app` (renaming it
would invalidate `yarn.lock`). iOS projects are untouched.
