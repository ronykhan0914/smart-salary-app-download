# Smart Salary App — Final handoff package (R5.11)

This repository contains the Netlify PWA frontend and Render Node.js/PostgreSQL API in one root directory.

## Production endpoints
- Frontend: https://khanronysalaryapp.netlify.app
- API: https://smart-salary-app.onrender.com
- Health check: https://smart-salary-app.onrender.com/api/health

## Deployment layout
- Netlify publish directory: `.` (repository root), configured in `netlify.toml`.
- Render runtime: Node.js 20+
- Render build command: `npm install`
- Render start command: `npm start`
- Render root directory: blank (repository root)

## Required Render environment variables
- `DATABASE_URL`: existing Render PostgreSQL **Internal Database URL**
- `JWT_SECRET`: unique random secret, at least 32 characters
- `ADMIN_USERNAME`: admin login username
- `ADMIN_PASSWORD_HASH`: bcrypt hash generated locally with `make-admin-hash.js`
- `APP_ORIGIN`: `https://khanronysalaryapp.netlify.app` (no trailing slash)
- `DATABASE_SSL`: `true` (or leave unset; TLS is enabled by default)

Never commit secrets, database URLs, passwords, tokens, or employee salary exports to GitHub. Do not share them in chat.

## Database initialization
The backend automatically applies the root `schema.sql` on `/api/health` and before API routes. The migration is designed to be repeatable and does not drop existing tables or user records. Do not reset or recreate the production database to solve schema issues.

After deploy, open `https://smart-salary-app.onrender.com/api/health`. Expected response:
`{"ok":true,"service":"smart-salary-api","database":"ready"}`

## Deploy this package
1. Extract the ZIP.
2. Upload/replace the **contents** of `smart-salary-app-main` at the root of the existing GitHub repository (not the ZIP itself).
3. Commit the changes. Render and Netlify should deploy automatically if auto-deploy is enabled; otherwise deploy each service from its dashboard.
4. Wait for both deploys to finish. Check the health URL above.
5. Open the frontend in a private/incognito tab or clear only this site's cache, then test with a dummy account first.

## API routes
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/me`
- `PATCH /api/profile`
- `PUT /api/sync`
- `GET /api/restore`
- `POST /api/admin/login`
- `GET /api/admin/stats`
- `PATCH /api/admin/users/:id/status`
- `POST /api/admin/users/:id/reset`
- `POST /api/admin/users/:id/delete`

## Important behavior and limits
- Registration is centralized in PostgreSQL; duplicate username/employee code/email is rejected by the database.
- User backup rows are scoped by `user_id`; a user token can only read/write that user's row.
- Login now falls back to locally stored credentials only when the API is unreachable. A server 401/403 (wrong password or disabled account) is not bypassed by local credentials.
- Local/offline data is stored in the browser on that device. It is not remotely erased by admin actions.
- The local recovery question/code is device-local; it is not a cross-device server password-reset system.
- Google Drive Backup/Restore still depends on Google Cloud OAuth origin, consent-screen, test-user and Drive API configuration. This package does not claim that live OAuth has been verified.
- Render Free PostgreSQL is a test/free-tier database, not a permanent backup guarantee. Export important data regularly and review the current expiry/retention in Render.
- No paid Render resources or pgAdmin services are required for this package.

## Test sequence
Use dummy information only until verified:
1. Health endpoint returns `ok: true` and `database: ready`.
2. Register a new test account.
3. Log out and log in using that account.
4. Update profile and save a dummy salary record.
5. Refresh/reopen the app and confirm data remains.
6. If testing two accounts, confirm each sees only its own data.
7. Test Admin login/status controls only after confirming the admin credentials are configured.

Do not treat the app as fully production-verified until registration, login, sync/restore and multi-user isolation have passed live tests.

## Offline-first Android migration status (2026-11-18)
- Android shell now uses locally bundled frontend files (`android-wrapper/web`) rather than loading the hosted frontend as a remote WebView shell.
- GitHub Actions Build Android APK run #9 succeeded, including local asset bundling and debug APK build.
- This is only the first offline-shell milestone. Offline storage, offline auth, durable sync queue, conflict-safe multi-device sync, local Quran/Hadith notifications, signed release APK, and device validation remain in progress.
- Ownership, backup, signing-key safety, and update distribution notes: `docs/OWNER-CONTROL-AND-RELEASE-BN.md` and `docs/PROJECT_HANDOVER_BN.md`.
