# Smart Salary Android APK (Capacitor — Offline-first migration)

## Current milestone
- Capacitor shell bundles the frontend locally into `android-wrapper/web`.
- Config uses `webDir: "web"` and does not load the hosted site as a remote shell.
- `node build-local-web.mjs` copies root frontend entry/assets into the local bundle.
- API connectivity still points to the separate backend through `api-config.js`; online services need internet.

## Build flow
GitHub Actions `Build Android APK`:
1. Node 22 + Java 21
2. install wrapper dependencies
3. bundle local frontend assets with `node build-local-web.mjs`
4. Capacitor scaffold/sync Android
5. build debug APK and upload artifact

## Not yet completed or verified
- Offline authentication and local SQLite/IndexedDB data store
- Durable offline operation queue and conflict-safe server sync
- Quran/Hadith local content archive and native scheduled notifications
- Device testing with airplane mode, app restarts and cross-device sync
- Production signing keystore / signed release APK
- Version/update-check UI and release distribution

This local shell change is a foundation only. Do not advertise the app as fully offline until the items above are implemented and tested.
