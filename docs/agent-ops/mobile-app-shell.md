# Mobile App Shell Notes

## Current Shape
- The browser UI is now installable as a PWA through `public/manifest.webmanifest` and `public/sw.js`.
- The service worker caches only the shell and static assets. It does not cache `/api/*` planner data responses.
- The Android wrapper is managed by Capacitor in `android/`.
- Public distribution is now split into `Android signed APK` plus `iPhone Safari PWA`.
- The public login shell hides placeholder billing UI by default and links users to `/install`.

## Commands
- Add Android once: `npm run mobile:android:add`
- Sync Capacitor config and web assets: `npm run mobile:android:sync`
- Open the Android project: `npm run mobile:android:open`
- Build a signed public APK: `npm run mobile:android:release`
- Verify the deployed public server: `npm run deploy:verify:public -- -BaseUrl https://example.com`

## Server URL
- Capacitor currently loads the existing Express app through `CAPACITOR_SERVER_URL`.
- Default value: `http://10.0.2.2:3000`
- That default is intended for the Android emulator while the local Express server runs on the host machine.
- For a physical device or deployed build, set `CAPACITOR_SERVER_URL` to a reachable host before syncing.
- Public APK builds must use an `https://` URL.

## Release Signing
- Create a keystore and keep it outside git. `android/keystore.properties.example` documents the required keys.
- The Android release build reads signing data from either `android/keystore.properties` or these environment variables:
  - `ANDROID_KEYSTORE_PATH`
  - `ANDROID_KEYSTORE_PASSWORD`
  - `ANDROID_KEY_ALIAS`
  - `ANDROID_KEY_PASSWORD`
- Version injection also supports:
  - `ANDROID_VERSION_CODE`
  - `ANDROID_VERSION_NAME`

## Public Runtime Config
- Production server env should use:
  - `STORAGE_DRIVER=mysql`
  - `AUTH_REQUIRED=true`
  - `PUBLIC_BILLING_ENABLED=false`
  - strong non-example MySQL and bootstrap admin credentials
- `.env.production.example` is the template for that deployment shape.

## iPhone Delivery
- Native iOS packaging is still out of scope on Windows.
- iPhone users open the deployed HTTPS site in Safari and add it to the home screen.
- `/install` now provides the end-user instructions for both Android APK and iPhone PWA flows.

## Remaining Manual Checks
- Confirm PWA install and standalone launch in a real browser.
- Confirm the offline fallback screen appears when the shell is cached but the network is unavailable.
- Confirm the deployed server reports `authRequired=true` and `storageDriver=mysql`.
- Confirm Android release APK install, login, update install, and key planner flows on a real device.
- Confirm iPhone Safari home-screen install, standalone launch, login, and key planner flows on a real device.
