# Building TAD Drivers for Android

Status: **not built yet.** The machine this fork was prepared on has no Android SDK, so no APK/AAB has been produced and the
app has never been run on a device or emulator. The unit tests and the typecheck of the new modules pass (see the README).
Follow the steps below on a machine with the Android toolchain.

## What you (the owner) must supply

| Item | Where it goes | Notes |
|---|---|---|
| Release signing keystore | `ANDROID_NAVIGATOR_APP_UPLOAD_*` in `.env` | You create it once (below) and must never lose it or commit it. |
| Firebase project + `google-services.json` | `android/app/google-services.json` (git-ignored) | Needed by the Gradle `google-services` plugin even if you only use polling. Package name must equal `APP_IDENTIFIER`. |
| Fleetbase host + API key | `FLEETBASE_HOST`, `FLEETBASE_KEY` in `.env` | Your own Fleetbase instance (console key `flb_live_...`). |
| TAD platform address | `TAD_PLATFORM_URL` in `.env` | Default only; drivers can change it in the app. Must be `https://` for release builds. |
| Google Maps API key | `GOOGLE_MAPS_API_KEY` in `.env` | Maps SDK for Android enabled. |
| Transistorsoft licence | `TRANSISTORSOFT_LICENSE_KEY` in `.env` | `react-native-background-geolocation` requires a licence for release builds, bound to `APP_IDENTIFIER`. Debug builds work without. |
| Privacy policy page | `https://texasafterdark.co.uk/privacy` (see `src/platform/brand.ts`) | Google Play requires one because the app collects background location. Publish a page there or change the constant. |
| Per-driver tokens | issued by the shop admin | `POST /api/drivers/:id/token` on the platform (shown once). |

## Prerequisites

- Node 20.19.4+ / 22.13+ / 24.3+ (see `engines` in `package.json`)
- Yarn 3.6.4 through Corepack: `corepack enable && corepack prepare yarn@3.6.4 --activate`
- JDK 17, Android Studio with Android SDK Platform 36 and build tools, `ANDROID_HOME` set
- A phone with USB debugging, or an emulator with Google Play services

## 1. Install

```sh
yarn install --immutable
cp .env.example .env     # then fill in the values above
```

`yarn install` runs `scripts/patch-react-native-packages.js` (upstream patches).

## 2. Firebase

1. Create a Firebase project, add an Android app with package name = `APP_IDENTIFIER` (default `uk.co.texasafterdark.drivers`).
2. Download `google-services.json` to `android/app/google-services.json`.
3. Push notifications: Fleetbase sends order pushes through its own FCM setup (upstream mechanism, unchanged). The TAD
   notifications ("Your next orders are ready", "Pick up your orders") do **not** depend on FCM: the app polls the platform
   every 20 s and on every return to the foreground and shows an in-app banner plus a local notification. The platform also
   exposes `POST /driver/push/subscribe` (web push); the native app does not use it.

## 3. Debug build (device or emulator)

```sh
yarn start            # Metro
yarn android          # in another terminal; installs the debug build
```

Debug builds allow `http://` to a LAN test server (`android/app/src/debug/res/xml/network_security_config.xml`). Release builds
do not: use HTTPS.

## 4. Release signing

Create the upload keystore once and keep it somewhere safe and backed up (outside this repo):

```sh
keytool -genkeypair -v -storetype PKCS12 -keystore ~/tad-drivers-upload.keystore \
  -alias tad-drivers -keyalg RSA -keysize 2048 -validity 10000
```

Then in `.env` (never commit it):

```
ANDROID_NAVIGATOR_APP_UPLOAD_STORE_FILE=/absolute/path/to/tad-drivers-upload.keystore
ANDROID_NAVIGATOR_APP_UPLOAD_STORE_PASSWORD=...
ANDROID_NAVIGATOR_APP_UPLOAD_KEY_ALIAS=tad-drivers
ANDROID_NAVIGATOR_APP_UPLOAD_KEY_PASSWORD=...
ANDROID_VERSION_CODE=1        # increase for every upload
ANDROID_VERSION_NAME=1.0.0
```

`android/app/build.gradle` refuses to build a release without all four signing values.

## 5. Release build

```sh
cd android
./gradlew assembleRelease      # APK for sideloading: android/app/build/outputs/apk/release/
./gradlew bundleRelease        # AAB for Google Play:  android/app/build/outputs/bundle/release/
```

Sideloading to drivers: send them the signed APK; they must allow "install unknown apps" for the app they open it from.

## 6. Smoke test before handing it to a driver

Use a test driver on the platform and a Fleetbase test order.

1. Sign in with the Fleetbase phone login, allow location.
2. Account > TAD platform: enter the address and the token, Save and test. Expect "Connected".
3. Home: Clock in. The shift timer runs. Clock out while a run is out: expect "Finish your current run first".
4. Create a delivery order on the platform and let it batch. Expect the banner "Your next orders are ready".
5. Collect: scan a bag from that run (green tick), scan a bag from another run (red "Wrong bag" and vibration),
   type an order number by hand. "Start run" stays disabled until every bag is scanned.
6. Orders tab: open the order, use Delivered, or Failed with a reason and photo. Check the platform's board and the
   customer message.
7. Complete an order through the Fleetbase "Update activity" flow with proof of delivery: the platform must also show it delivered.

## Regenerating icons and splash

Source images are in `assets/` (`app-icon.png`, `splash-screen.png`, built from `assets/brand/`).

```sh
node scripts/fix-android-app-icons.js --input ./assets/app-icon.png
node scripts/fix-android-launch-screen.js --input ./assets/splash-screen.png
```

iOS has not been rebranded or built (Android only for now).
