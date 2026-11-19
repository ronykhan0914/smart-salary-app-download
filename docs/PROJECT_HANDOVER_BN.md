# Smart Salary App — পূর্ণ প্রকল্প সংরক্ষণ ও হস্তান্তর নথি
সর্বশেষ হালনাগাদ: ১৮ নভেম্বর ২০২৬ (বাংলাদেশ সময়)

## ১. প্রকল্পের পরিচয়
- প্রকল্প: Smart Salary App
- GitHub (মূল/ক্যানোনিক্যাল সোর্স): https://github.com/ronykhan0914/smart-salary-app
- Production branch: `main`
- Live Frontend: https://smart-salary-frontend-914.onrender.com
- Live Backend API: https://smart-salary-app.onrender.com
- পুরোনো Netlify URL: https://khanronysalaryapp.netlify.app (ঐতিহাসিক; বর্তমান প্রধান frontend নয়)
- App ধরন: Installable PWA; Android-এ Chrome engine ব্যবহার করে। এটি বর্তমানে Play Store-এর native APK নয়।

## ২. মূল সংরক্ষণনীতি
1. GitHub-এর `main` branch-ই মূল source of truth। প্রতিটি পরিবর্তনের আগে সর্বশেষ main থেকে কাজ করতে হবে।
2. কোনো production পরিবর্তনের আগে commit, সংশ্লিষ্ট ফাইল, deploy status এবং rollback point নথিভুক্ত করতে হবে।
3. ব্যক্তিগত বেতন/উপস্থিতি/অ্যাকাউন্ট ডেটা source code বা GitHub-এ রাখা যাবে না। এগুলো database/account storage-এ থাকে।
4. `.env`, API token, database URL/password, JWT secret, VAPID private key, OAuth secret, user password বা keystore কখনো commit/চ্যাটে প্রকাশ করা যাবে না।
5. Database schema/data পরিবর্তনের আগে backup ও migration plan আবশ্যক। UI/formula update-এর নামে database reset/drop/truncate করা নিষিদ্ধ।
6. Launcher icon-এ থাকা ব্যবহারকারীর ছবি অক্ষত রাখতে হবে। Intro-র ভেতরের প্রয়োজনীয় গোলাকার portrait-টি সালাম/বিসমিল্লাহ লেখার উপরে থাকবে; অপ্রয়োজনীয় opening image থাকবে না।
7. ব্যবহারকারীর অনুমতি ছাড়া নকশা, রঙ, menu, account, stored data, notification schedule বা deployment architecture পরিবর্তন নয়।

## ৩. বর্তমান production/deployment ব্যবস্থা
### Frontend
- Render service: `smart-salary-frontend-914`
- Service ID: `srv-dbtp1ep42hec73aj4ng0`
- Type: Static Site
- Build: `node build-frontend.mjs`
- Publish directory: `public`
- Branch: `main`
- Auto deploy: enabled; trigger: commit
- URL: https://smart-salary-frontend-914.onrender.com

### Backend
- Render service: `smart-salary-app`
- Service ID: `srv-dbsb8quk1f9s738q6510`
- Type: Node web service, Free plan, Singapore
- Build: `npm install`
- Start: `npm start`
- Branch: `main`
- Auto deploy: enabled; trigger: commit
- URL: https://smart-salary-app.onrender.com

### Database
- Render Postgres database name previously used: `smart_salary_test_db`
- Database resource ID recorded in project notes: `dpg-dbrmeagu01pc73dv2ku0-a`
- Region: Singapore; Postgres 18
- পূর্বের Render তথ্য অনুযায়ী Free database-এর নির্ধারিত expiry ছিল ১৩ ডিসেম্বর ২০২৬। বর্তমান plan/expiry Dashboard-এ আবার যাচাই করতে হবে।
- Database connectivity/schema/backup completion এই নথি তৈরির সময় স্বাধীনভাবে যাচাই করা হয়নি। কোনো অবস্থাতেই একে verified backup ধরে নেওয়া যাবে না।
- DB URL বা credentials এই নথিতে ইচ্ছাকৃতভাবে রাখা হয়নি।

## ৪. সর্বশেষ কোড/ডিপ্লয়
- সর্বশেষ frontend source commit: `ab15f281fb7c8099956d169b6969575036a10c98`
- Commit message: Refresh PWA cache for portrait and allowance migration
- আগের source commit: `7a0f75c891c6062ca5547cfa8491d84ceb66c9a8`
- সংশ্লিষ্ট Render frontend deploy: `dep-dbu9kvjr759s738sdch0` — status LIVE
- পূর্ববর্তী deploy: `dep-dbu9kugae00c73b6kfq0` — পরে deactivated
- Service worker cache version: `r20`
- Build log-এ `0 vulnerabilities` দেখা গিয়েছিল; এটি পূর্ণ security audit নয়।
- Live deploy মানে সার্ভারে কোড প্রকাশিত; বাস্তব Android ফোনে UI/ব্যবহার পরীক্ষা আলাদা।

## ৫. অনুমোদিত বেতন/ভাতা ফর্মুলা (ব্যবহারকারীর সর্বশেষ নির্দেশ)
| Duty/Shift | OT hours | Tiffin | Night |
|---|---:|---:|---:|
| General | 5 | ৳22 | ৳0 |
| General | 7 | ৳0 | ৳100 |
| A Shift | 7 | ৳0 | ৳100 |
| B Shift | 3 | ৳0 | ৳45 |
| B Shift | 5 | ৳0 | ৳45 |
| B Shift | 5.5 | ৳0 | ৳45 |

- এই নিয়মে উপরোক্ত কেসগুলোতে একই সঙ্গে tiffin ও night bill যোগ হবে না।
- বর্তমান `index.html`-এ `dailyAllowances(shift, overtimeHours)` helper এই নিয়ম বাস্তবায়ন করে।
- `calcPrev()` এবং legacy `saveDay()` উভয় জায়গায় একই helper ব্যবহার নিশ্চিত করতে হবে।
- ভবিষ্যতে নতুন shift বা সময় যোগ হলে আগে ব্যবহারকারীর কাছ থেকে স্পষ্ট নিয়ম নিতে হবে; অনুমান করে formula পরিবর্তন নয়।
- ঐতিহাসিক ৭ ঘণ্টার এন্ট্রি পুনর্গণনা/ক্লাউডে সিঙ্কের জন্য code path যোগ করা হয়েছে বলে commit message-এ উল্লেখ আছে; কিন্তু প্রত্যেক account-এর প্রতিটি পুরোনো record বাস্তবে সঠিকভাবে update হয়েছে কি না ফোন/ডাটাবেজে যাচাই হয়নি। হিসাবের মাসভিত্তিক report মিলিয়ে দেখা আবশ্যক। পুরোনো record overwrite করার আগে backup নিতে হবে।

## ৬. ছবি, Intro ও Play আচরণ
ব্যবহারকারীর চূড়ান্ত পছন্দ:
- App launcher icon-এর নিজস্ব portrait থাকবে; সেটি বদলানো যাবে না।
- Intro-তে সালাম ও বিসমিল্লাহর উপরে মূল portrait গোলাকার বৃত্তে দেখাবে।
- শুরুতে যে অপ্রয়োজনীয়/অতিরিক্ত স্থির ছবি আসে, সেটি সরাতে হবে।
- Play control একটিই থাকবে; duplicate Play button নয়।
- বর্তমান source-এ portrait-টি `splashPortrait` ID দিয়ে রয়েছে এবং CSS দিয়ে Play-এর পর দেখানোর ব্যবস্থা করা হয়েছে। ফোনে বাস্তব যাচাই এখনো ব্যবহারকারীর কাছ থেকে নিশ্চিত করতে হবে।
- Android 12-এর native system splash interactive Play button দেখাতে পারে না; PWA intro এবং Android system splash আলাদা বিষয়।

## ৭. PWA cache ও আপডেট
- Service worker file: `sw.js`; cache version bump না করলে কিছু ফোনে পুরোনো UI cache থেকে দেখা যেতে পারে।
- Frontend-এর প্রতিটি production UI commit-এর সঙ্গে প্রয়োজনমতো cache version bump ও deploy verify করতে হবে।
- ব্যবহারকারীকে app সম্পূর্ণ বন্ধ করে পুনরায় খুলতে বলা যায়। Uninstall, app storage clear বা account/data deletion প্রস্তাব নয়—বিশেষ অনুমতি ছাড়া নয়।

## ৮. Notifications / Google Drive — সীমাবদ্ধতা ও যাচাই
- দৈনিক কোরআন/হাদিস notification-এর কাঙ্ক্ষিত সময়: বাংলাদেশ সময় সকাল ০৯:০০ এবং রাত ২১:০০।
- পূর্বে GitHub scheduled workflow-এর cron মান ছিল `0 3 * * *` এবং `0 15 * * *` (UTC থেকে বাংলাদেশ সময় রূপান্তর)।
- VAPID environment variables Render-এ সেট করা হয়েছিল বলে পূর্বের কাজের নথিতে আছে; secret value এখানে নেই।
- Scheduled job চালু থাকা এবং বাস্তব Android device-এ push পৌঁছানো এক বিষয় নয়। end-to-end delivery এখনো নিশ্চিত নয়; logs ও device test করতে হবে।
- Google Drive OAuth-তে frontend origin mismatch সমস্যা হয়েছিল। বর্তমান production origin `https://smart-salary-frontend-914.onrender.com`; OAuth authorized origins-এ প্রয়োজন হলে এটি যোগ করতে হবে এবং পুরোনো origin অকারণে মুছবেন না।
- Drive backup/restore, push, notification content-এর বাস্তব ব্যবহারকারীভিত্তিক পরীক্ষা আলাদা checklist-এ করতে হবে।

## ৯. Android APK/TWA অবস্থা
- `android-twa-safe-build` নামে একটি preview branch/প্রস্তুতি আগে তৈরি হয়েছিল।
- Package name: `com.ronykhan.smartsalary`
- Debug preview workflow/README/script ছিল; final signed release APK নিশ্চিতভাবে তৈরি বা প্রকাশিত হয়নি।
- Debug signing key দিয়ে final release upgrade সম্ভব নাও হতে পারে; production signing keystore নিরাপদে সংরক্ষণ করতে হবে। Keystore/password কখনো GitHub-এ নয়।
- Digital Asset Links এবং TWA পূর্ণ-স্ক্রিন যাচাই বাকি থাকতে পারে।
- ব্যবহারকারী APK চাইলে আলাদা অনুমোদন ও release checklist নিয়ে কাজ করতে হবে; বর্তমান PWA-কে APK বলে দাবি করা যাবে না।

## ১০. ভবিষ্যতে ChatGPT-তে পরিবর্তন দিয়ে Live App আপডেট করার স্থায়ী workflow
এই সংযোগের মূল কাঠামো ইতিমধ্যে আছে:
1. ChatGPT-র GitHub সংযোগে `ronykhan0914/smart-salary-app` repository-র access থাকতে হবে।
2. Render service দুটো একই GitHub repo-র `main` branch track করে এবং autoDeploy=commit চালু আছে।
3. ChatGPT-কে স্পষ্টভাবে বলতে হবে: “আমার Smart Salary App-এর GitHub repo `ronykhan0914/smart-salary-app`, branch `main`। আগের সিদ্ধান্ত অক্ষত রেখে শুধু এই পরিবর্তনটি করো। আগে বর্তমান source পড়বে, তারপর code edit/commit করবে, Render deploy LIVE হওয়া যাচাই করবে; database বা user data স্পর্শ করবে না।”
4. পরিবর্তন করার পর GitHub commit SHA নেবে; Render deploy status `live` না হওয়া পর্যন্ত কাজ সম্পন্ন বলবে না।
5. Deploy LIVE হলেও ফোনের UI, হিসাব, login, notification ও sync আলাদাভাবে device test করতে হবে।
6. নতুন ChatGPT conversation-এও যদি GitHub/Render tool access না থাকে, Settings/Connected apps-এ সংশ্লিষ্ট GitHub ও Render integration reconnect/authorize করতে হবে। Access ছাড়া “আমি অ্যাপে পরিবর্তন পাঠিয়ে দিয়েছি” বলা যাবে না।
7. User-কে কখনো API key, password, DB URL, VAPID private key বা OAuth secret চ্যাটে দিতে বলা যাবে না।

## ১১. অন্য ডেভেলপারকে দেওয়ার কাজের নির্দেশ
- প্রথমে এই নথি এবং root README পড়ুন।
- GitHub repo clone করে `main` branch থেকে শুরু করুন।
- `index.html`-এ UI/business logic; `sw.js`-এ PWA caching; `build-frontend.mjs` frontend build/publish; `server.js` backend entry point; `package.json` dependencies/scripts; database schema/migration files-এ DB structure খুঁজুন।
- কোনো ফাইলের অবস্থান অনুমান করে নতুন duplicate file তৈরি করবেন না; repository tree যাচাই করুন।
- frontend ও backend আলাদা Render service হলেও একই repo ব্যবহার করে; frontend build script কেবল frontend assets প্রকাশ করে—backend files frontend publish folder-এ কপি করে না।
- আগে tests/lint/build চালান; formula test cases উপরের table অনুযায়ী দিন।
- Database migration additive, reversible ও backup-backed হতে হবে।
- commit শেষে frontend/backend যে service প্রভাবিত হয় সেটির deploy monitor করুন; প্রয়োজন ছাড়া backend redeploy নয়।
- কাজের শেষে changed files, commit SHA, Render deploy ID/status, test results, known limitations লিখে দিন।

## ১২. চূড়ান্ত সংরক্ষণ checklist
- [x] GitHub main branch-এ source version control
- [x] Frontend Render auto-deploy enabled
- [x] Backend Render auto-deploy enabled
- [x] Current frontend deploy LIVE (commit ab15f281…)
- [x] Project handover document যোগ করা
- [ ] GitHub repository থেকে ZIP backup আলাদাভাবে ডাউনলোড করে নিজের Google Drive/কম্পিউটারে রাখা
- [ ] Database-এর encrypted/secure backup নিয়ে restore test করা
- [ ] Render Postgres expiry/plan পুনরায় যাচাই
- [ ] Notification delivery বাস্তব Android-এ পরীক্ষা
- [ ] Google Drive OAuth backup/restore end-to-end পরীক্ষা
- [ ] Intro portrait, unwanted image removal, single Play control ফোনে পরীক্ষা
- [ ] Release signing key থাকলে নিরাপদ offline backup; না থাকলে এখনো APK release-ready নয়

**গুরুত্বপূর্ণ:** GitHub commit history source code-এর version history দেয়; এটি database backup নয়। এই নথি ও source repo সংরক্ষণ করলেই user account/বেতন/উপস্থিতির data backup সম্পন্ন হয় না।
