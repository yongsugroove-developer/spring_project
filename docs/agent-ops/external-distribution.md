# External Distribution

## Scope
- Android delivery: signed APK shared directly with testers or users
- iPhone delivery: Safari PWA from the deployed HTTPS domain
- Excluded: App Store, TestFlight, Play Store, native iOS build on Windows, real checkout

## Production Runtime
- Use `.env.production.example` as the starting point
- Required production expectations:
  - `STORAGE_DRIVER=mysql`
  - `AUTH_REQUIRED=true`
  - `PUBLIC_BILLING_ENABLED=false`
  - strong MySQL credentials
  - strong bootstrap admin credentials

## Public Smoke Check
- Command:
  - `npm run deploy:verify:public -- -BaseUrl https://example.com`
- The script verifies:
  - `/api/health`
  - public signup
  - login
  - `/api/auth/me`
- Each run creates a new smoke-test user in the production database.

## Android Release APK
- Create a keystore outside git and copy `android/keystore.properties.example` to `android/keystore.properties`, or set these env vars:
  - `ANDROID_KEYSTORE_PATH`
  - `ANDROID_KEYSTORE_PASSWORD`
  - `ANDROID_KEY_ALIAS`
  - `ANDROID_KEY_PASSWORD`
- Set the deployed host:
  - `CAPACITOR_SERVER_URL=https://example.com`
- Optional version overrides:
  - `ANDROID_VERSION_CODE=2`
  - `ANDROID_VERSION_NAME=1.0.1`
- Build:
  - `npm run mobile:android:release`
- Output:
  - `android/app/build/outputs/apk/release/app-release.apk`

## iPhone Safari PWA
- Open the deployed HTTPS domain in Safari
- Tap Share
- Choose Add to Home Screen
- Launch from the created home-screen icon
- Login is still required and planner data still needs network access

## Manual Release Checklist
- Public deploy smoke check passes
- Android APK installs on a fresh device
- Android APK can update-install over the previous version
- iPhone Safari home-screen install works
- Login, logout, register, and key planner flows work on both platforms
- The app no longer presents placeholder billing as a real production checkout
