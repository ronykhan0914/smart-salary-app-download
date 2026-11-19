# Smart Salary — Offline-first Android Upgrade (Bangla)

## Scope / safety
- Preserve existing production PWA, API, Render services, PostgreSQL schema/data, and users.
- The current Capacitor APK is a hosted WebView wrapper and is NOT offline-first.
- Work in isolated Android/offline modules first; do not overwrite production payloads or apply DB migrations without backup, reviewed migration, and test plan.

## Target behavior
1. Android app shell, HTML/CSS/JS, salary engine, fonts, and essential assets bundled locally; app opens without internet.
2. First account registration/login requires network. After a successful login, securely persist an offline credential verifier/token strategy (prefer native secure storage; do not keep raw passwords in localStorage) and permit offline access to the last authorized account on that device.
3. Local persistence: SQLite via Capacitor native plugin, schema versioned, transactional. Existing web localStorage data must be migrated/exported safely and verified before deletion; never delete the old copy during migration.
4. Offline edits are stored locally with UUID operation IDs, timestamps, entity keys, and a pending-sync state.
5. Sync: queue only changes; server currently PUT /api/sync replaces the entire JSON payload. That endpoint is unsafe for multi-device merge if two devices edited independently. Build a versioned/operation-based sync API and additive migration with conflict policy before enabling automatic sync. Existing /api/sync remains unchanged until migration tests pass.
6. Sync status UI: Offline, Online, Syncing, Pending changes, Last successful sync, retry/error. Retry exponential backoff and avoid duplicate operations using unique operation IDs.
7. Backup/export: offline JSON/CSV export and local restore. Google Drive remains online-only.
8. Islamic reading archive: cache verified Quran ayah and Sahih Bukhari/Muslim hadith content locally. Provide date-based archive, minimum 15 days (aim 30/90 days or larger when storage permits), Arabic, Bangla meaning, references, source attribution, and detail view. Validate source, translation licensing/availability, and content integrity before packaging.
9. Notifications: local scheduled Android notifications at 09:00 Asia/Dhaka Quran and 21:00 Asia/Dhaka hadith, with tap deep-link into detail page. Push notifications may supplement when online; avoid duplicate local+push deliveries for same date/type.
10. QA: test airplane mode cold start, offline login, salary calculations, saving/editing/deleting, restart persistence, reconnect sync, two-device concurrent edits/conflicts, backup/restore, notification timing/permission, deep-link, Android back, storage limits, and upgrade/migration rollback.

## অগ্রগতি (2026-11-18)
- প্রথম নিরাপদ ভিত্তি তৈরি: Android build workflow এখন root app files (`index.html`, `daily.html`, `admin.html`, config, images, audio) Android `web/` assets-এ bundle করে।
- Capacitor remote `server.url` সরানো হয়েছে; Android shell আর hosted website-এ বাধ্যতামূলকভাবে নির্ভর করবে না।
- এই commit series Android build automation trigger করেছে; build result এখনো pending. এটি offline data-sync/notification completion নয়।

## Suggested implementation stages
- A. Audit app data shapes, save points, authentication/session, sync API, notification pipeline, service worker and APK build.
- B. Build offline database + safe migration and local bundled shell.
- C. Offline authentication and salary calculations; convert all write paths to local transactions.
- D. Operation-based server sync + conflict resolution; staged DB migration and backups.
- E. Quran/Hadith content bundle/archive/detail view + local notifications.
- F. Integrate into Capacitor Android APK, CI build, tests, release signing and device validation.

## Initial audit findings
- Current frontend stores salary/month/day/account-related data in localStorage (keys include rec_, day_, sal_, cred_, api_token_).
- Current cloud sync sends a full snapshot to PUT /api/sync, and server replaces the user_data payload on each request. This must not be used as a naive offline queue for multi-device changes because independent edits can overwrite each other.
- Current daily notification API stores daily Quran/Hadith items in PostgreSQL and delivers Web Push. This does not guarantee offline delivery in a native WebView. Local Android notifications and bundled/cacheable content are required.
- Current Capacitor config uses server.url to load the hosted site. Remove server.url for an offline-capable bundled app after integrating local app assets; retain API endpoint separately for online sync.
