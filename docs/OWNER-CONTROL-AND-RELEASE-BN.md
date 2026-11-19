# Smart Salary App — মালিকানা, সোর্স, আপডেট ও হস্তান্তর

সর্বশেষ হালনাগাদ: ১৮ নভেম্বর ২০২৬

## 1. মূল মালিকের নিয়ন্ত্রণ
- Canonical source: https://github.com/ronykhan0914/smart-salary-app
- Production branch: main
- Repository private রাখা হয়েছে; Owner/Admin access কেবল মালিকের অনুমোদিত অ্যাকাউন্টে থাকবে।
- Source, workflow, deployment config, project notes, test checklist এই repository-তে versioned থাকবে।
- Render service ownership/account access GitHub source থেকে আলাদা: মালিকের Render account-এ service, DB, environment secrets, deployment permissions নিয়ন্ত্রণ নিশ্চিত রাখতে হবে।

## 2. Source backup / অন্য developer-কে handover
1. GitHub repository থেকে ZIP backup নিন (Code → Download ZIP)।
2. History-সহ পূর্ণ backup চাইলে mirror clone: `git clone --mirror https://github.com/ronykhan0914/smart-salary-app.git`; mirror repository-টি নিরাপদ backup location-এ রাখুন।
3. এই docs, README, workflow files, এবং `OFFLINE-FIRST-ROADMAP-BN.md`-সহ backup দিন।
4. Developer-কে Owner/Admin permission না দিয়ে প্রয়োজন হলে collaborator access সীমিত scope-এ দিন।
5. Developer কাজ শেষ করলে review, commit SHA, test output, deploy status ও rollback instructions লিখিতভাবে নিন।

## 3. Secrets ও signing key ownership
- Render environment variables (DB URL/password, JWT, VAPID, OAuth secrets) শুধু মালিকের account-এ; source control-এ নয়।
- Android release signing keystore/password মালিকের নিয়ন্ত্রণে রাখতে হবে; অন্তত দুইটি encrypted backup রাখুন।
- Keystore হারালে একই Android app package-এ future updates করার পথ ভেঙে যেতে পারে। এটি repository-তে আপলোড করা নিষিদ্ধ।
- Debug APK release-এর জন্য নয়; final signed APK build ও installation validation বাকি।

## 4. Update delivery — কী স্বয়ংক্রিয়, কী নয়
### PWA / hosted web
- Frontend commit → Render static deploy → PWA/service worker refresh/update cycle. Cache policy অনুযায়ী কিছু ব্যবহারকারীকে app restart/refresh করতে হতে পারে; instant update guarantee নয়।
- Backend change হলে backend service deploy আলাদাভাবে trigger হতে পারে; deploy health ও regression test দেখতে হবে।

### Offline-bundled Android APK
- App shell/assets/native plugin change নতুন APK build করে release করতে হবে।
- Android security controls অনুযায়ী third-party APK install/update user-approved; background silently APK install করার প্রতিশ্রুতি দেওয়া যাবে না।
- Play Store release হলে Android Play Store-এর automatic update settings অনুযায়ী বিতরণ হতে পারে।
- ভবিষ্যতে in-app update checker: নতুন version, release notes, download link ও update reminder দেখাবে; APK download/install user approval লাগবে।

## 5. Version and release process
- Version format: `MAJOR.MINOR.PATCH` (যেমন 1.0.0), app version code প্রতিটি release-এ বৃদ্ধি।
- Release branch/tag: `vX.Y.Z`; GitHub Releases-এ APK, release notes, checksum (SHA-256) প্রকাশ।
- Release notes-এ changes, migration notes, known issues, rollback note থাকবে।
- User data migrations additive, backup-first, tested; destructive migration নিষিদ্ধ।
- প্রতিটি update-এ salary formula test, offline save/reopen, offline queue/sync, conflict case, notification and Android Back test চালাতে হবে।

## 6. Developer entry points
- `index.html`: primary frontend, app UI and current data writes.
- `daily.html`: daily Quran/Hadith view.
- `admin.html`: admin interface.
- `server.js`: backend API and sync/auth.
- `schema.sql`: database schema/migrations.
- `sw.js`: PWA cache/service worker.
- `build-frontend.mjs`: frontend publish bundle.
- `android-wrapper/build-local-web.mjs`: Android bundle local web assets.
- `android-wrapper/capacitor.config.json`: Android wrapper app identity and local web directory.
- `.github/workflows/build-android-apk.yml`: debug APK build workflow.

Before changing files, read `docs/PROJECT_HANDOVER_BN.md` and `OFFLINE-FIRST-ROADMAP-BN.md`. Do not overwrite production user data or secrets.

## 7. Current offline migration status
- Local Android web bundle is in place and debug build #9 succeeded.
- Full offline data persistence, offline authentication, operation-based sync, multi-device conflict handling, local scheduled Quran/Hadith notifications, release signing, and airplane-mode device tests are NOT complete yet.
- A successful debug APK build does not certify complete offline capability or a final user-ready app.
