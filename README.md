# TAD Drivers

The driver app for **Texas After Dark** takeaway deliveries (Android). It is a fork of the open-source
[Fleetbase Navigator](https://github.com/fleetbase/navigator-app) (React Native, AGPL-3.0) that keeps Navigator's screens
and look (maps, navigation, order screens, proof of delivery, chat, issues) and adds what the shop's own delivery platform
(`tad-delivery-platform`) needs from a driver:

| Added | What the driver does |
|---|---|
| **TAD platform settings** (Account) | Pastes the shop address and the driver token the shop admin issued. Token is kept in the Android Keystore. |
| **Clock in / out** (Home, and Home > Shift details) | One big button, running shift timer. Clocking in makes the driver available (the platform also sets them online in Fleetbase). Clocking out mid-run is refused: "Finish your current run first". |
| **Collect orders** (new tab) | Scans each bag's QR (`TAD|<order number>`). Right bag: green tick and the remaining list. Wrong bag: red full-screen "Wrong bag" with the shop's message and a vibration. Typing the order number works as a fallback. "Start run" unlocks only when every bag is scanned; there is no override. Then Navigator's Orders tab takes over. |
| **Delivered / Failed** (on each order) | Go through the platform so its state machine, customer messages and batching stay right. Failed asks for a reason (No answer / Wrong address / Customer refused / Other + text) and an optional photo. Navigator's own proof of delivery (photo / signature / QR) still runs against Fleetbase; when it completes the order the app also tells the platform. |
| **Run notifications** | Polls the platform every 20 s and when the app returns to the foreground: banner plus local notification for "Your next orders are ready" and "Pick up your orders". |

## How it differs from upstream

- Branding: name, logo, launcher icon and splash are Texas After Dark. Navigator's UI components and theme are unchanged.
- **Online payment only.** All cash / cash-on-delivery / wallet / earnings / pay / payroll / tips screens and displays are removed,
  not hidden (including prices on order items and the fuel-report cost screens). Drivers are self-employed and paid outside the platform.
- Release builds are HTTPS-only (upstream allowed cleartext).
- Upstream's dead `legacy/` app and its release/CI workflows were removed.

Full file-by-file list: [docs/CHANGES_FROM_UPSTREAM.md](docs/CHANGES_FROM_UPSTREAM.md). Upstream commit this fork started from:
[UPSTREAM.md](UPSTREAM.md).

## Configuration

Copy `.env.example` to `.env` (git-ignored) and fill it in. Nothing secret is committed.

| Variable | Meaning |
|---|---|
| `TAD_PLATFORM_URL` | Default platform address (drivers can change it in Account > TAD platform). Must be https for release builds. |
| `FLEETBASE_HOST`, `FLEETBASE_KEY` | Your Fleetbase instance (navigation, order screens, proof of delivery). |
| `GOOGLE_MAPS_API_KEY`, `DEFAULT_COORDINATES` | Maps. |
| `TRANSISTORSOFT_LICENSE_KEY` | Background location licence (release builds). |
| `APP_NAME`, `APP_IDENTIFIER`, `APP_LINK_PREFIX` | Identity (defaults: `TAD Drivers`, `uk.co.texasafterdark.drivers`, `tadrivers`). |
| `ANDROID_NAVIGATOR_APP_UPLOAD_*`, `ANDROID_VERSION_*` | Release signing and version. |

The **driver token is not a build setting**. The shop admin creates it with `POST /api/drivers/:id/token` on the platform
(shown once); the driver pastes it into the app. Fleetbase sign-in (phone login) is still done through Fleetbase as in upstream.

## Build

See [docs/BUILD_ANDROID.md](docs/BUILD_ANDROID.md) (prerequisites, Firebase, debug and release builds, signing, what the owner must supply).

```sh
corepack enable && corepack prepare yarn@3.6.4 --activate
yarn install --immutable
yarn typecheck     # strict typecheck of the TAD modules (src/platform)
yarn test          # jest
```

## Platform API contract

Base URL = the platform address. Every call sends `Authorization: Bearer <driver token>`. Errors are
`{ "error": "<message>", "code": "<code>" }`.

| Call | Used for | Notable results |
|---|---|---|
| `GET /driver/me` | Clock state | `{ driver_id, clocked_in, since, zone }` |
| `POST /driver/clock-in` `{ zone? }` | Clock in | 409 `already_in` |
| `POST /driver/clock-out` | Clock out | 409 `on_a_run` -> "Finish your current run first" |
| `GET /driver/run` | The run to collect / drive | `{ batch: {id,status}\|null, orders: [{id, number, name, postcode, address, stop_seq, picked_at, state, fleetbase_order_id, ...}], next_run_waiting }` |
| `POST /driver/scan` `{ code }` | Check one bag. `code` is exactly `TAD|<order number>`, e.g. `TAD|TAD-20261015-007` | 200 `{ ok, order, remaining, all_scanned }`; 409 `wrong_bag`; 422 `bad_code`; 404 `not_found` |
| `POST /driver/run/start` | Leave the shop. The app never sends `force`. | 409 `bags_not_scanned` ("Scan these bags first: ...") |
| `POST /driver/orders/:id/delivered` | Delivered | 403 `not_yours` |
| `POST /driver/orders/:id/failed` `{ reason, photo? }` | Failed. `photo` = `data:image/jpeg;base64,...`, at most 3 MB | |
| `GET /driver/notifications` | Poll every 20 s | `{ messages: [{ id, kind, title, body, batchId, at }] }`; the app shows `run_ready` and `pickup_next` |
| `POST /driver/notifications/read` `{ ids }` | Mark shown messages read | |

`:id` is the platform's numeric order id. A Fleetbase order is matched to its platform order through
`fleetbase_order_id` on the run.

## Notes and known gaps

- This repository has **never been built into an APK or run on a device/emulator** (no Android SDK on the machine it was
  prepared on). What is verified: unit and UI-render tests (`yarn test`) and the typecheck of the new modules (`yarn typecheck`).
- Upstream's whole-project `tsc` is not clean (its tsconfig has no JSX setting and the code is untyped); the new platform
  modules are strict-typechecked on their own.
- Android only. iOS projects are still Navigator-branded and untested.
- Push (FCM) for Fleetbase order notifications is upstream's mechanism and needs your `google-services.json`. The TAD
  run notifications use polling, so they work without FCM while the app is open or recently backgrounded.
- Logging out of Fleetbase also removes the platform token from the phone.

## Licence

GNU AGPL-3.0-or-later, same as upstream (`LICENSE`, `LICENSE.md`). If you run a modified version for others you must offer them this source.
