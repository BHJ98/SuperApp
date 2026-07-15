# Android app (Capacitor)

The Android app is a [Capacitor](https://capacitorjs.com) shell around the
same React codebase. The web assets are **bundled inside the APK**: the app
keeps working exactly as installed no matter what gets deployed to Vercel,
and only changes when you install a new APK. All data lives in Supabase, so
web and app always see the same state.

Google sign-in is fully native (Credential Manager → ID token →
`supabase.auth.signInWithIdToken`) — **no browser is involved**, so it works
on devices where Chrome is blocked. The two Vercel endpoints
(`/api/extract`, `/api/parse-receipt`) are reached cross-origin from the app
(`src/lib/apiBase.ts` + CORS in `api/_cors.ts`).

## One-time setup

### 1. Keystore

The APK must always be signed with the same keystore, or Android refuses to
update the installed app. Generate once (or use the one delivered with the
initial setup) and store the file + password in a password manager:

```bash
keytool -genkeypair -v -keystore superapp-release.keystore -alias superapp \
  -keyalg RSA -keysize 2048 -validity 10000
keytool -list -v -keystore superapp-release.keystore -alias superapp   # note the SHA1
base64 -w0 superapp-release.keystore                                   # for the GitHub secret
```

**If the keystore is ever lost**: generate a new one, update the SHA-1 in
Google Cloud (step 2), then uninstall + reinstall the app on every phone.
No data is lost — everything lives in Supabase.

### 2. Google Cloud Console

In the same project as the existing web OAuth client
(APIs & Services → Credentials):

- Create an **Android** OAuth client: package name `nl.bhj.superapp`,
  SHA-1 fingerprint from the keystore above. It is never referenced in
  code — its existence is what lets Credential Manager mint ID tokens.
- Keep the existing **web** client untouched; its ID stays
  `VITE_GOOGLE_CLIENT_ID` and is the audience of the native ID tokens.

### 3. Supabase dashboard

Authentication → Sign In / Providers → Google → add the web client ID to
**Authorized Client IDs**. Without this, native sign-in fails with an
audience error even though web OAuth works fine.

### 4. GitHub secrets

Repo → Settings → Secrets and variables → Actions → **Secrets**:

| Secret | Value |
|--------|-------|
| `VITE_SUPABASE_URL` | same as in Vercel |
| `VITE_SUPABASE_ANON_KEY` | same as in Vercel |
| `VITE_GOOGLE_CLIENT_ID` | the web OAuth client ID |
| `ANDROID_KEYSTORE_BASE64` | base64 of the keystore file |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | `superapp` |
| `ANDROID_KEY_PASSWORD` | key password (same as keystore password) |

Under **Variables**, set `VITE_WORKOUT_CLOUD` to the same value as in
Vercel (or leave unset if unset there) so the app uses the same workout
backend as the web app.

## Building a new APK

1. GitHub → Actions → **Android APK** → Run workflow → enter a version name
   (e.g. `1.1.0`).
2. When it finishes, a release `android-v<version>-<build>` appears with the
   `.apk` attached.
3. Open the release page on the phone (logged in to GitHub — release assets
   of a private repo require it), download the APK and open it. Allow
   "install unknown apps" for the browser the first time.

The `versionCode` is the workflow run number, so every new build installs
over the previous one. Rebuild only when you actually want the app to pick
up code changes — web deploys never affect the installed app.

## Keeping old app versions working

Because the app can lag behind the web code, keep SQL migrations
**backward-compatible**: add columns/tables rather than renaming or
repurposing them, and don't change RPC signatures in place. If a migration
must break an older client, build + install a new APK at the same time.

## Local development

```bash
npm run android:sync   # build web assets + copy into android/
cd android && ./gradlew assembleDebug
```

Requires JDK 21 and an Android SDK (`ANDROID_HOME`). The `android/` folder
is a committed Capacitor project; regenerate the launcher icons from
`public/favicon.svg` with `npm run icons:android`.

## Known limitations on the app

- Bakjes' Google Calendar live sync is hidden (it needs a Google popup in a
  real browser). ICS upload still works; the web app keeps the full feature.
- The PWA service worker / update prompt is disabled in the app — updates
  come exclusively through a new APK.

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Google sign-in: `DEVELOPER_ERROR` or error code 10 | SHA-1 or package name mismatch on the Android OAuth client. Recheck step 2 (the signing keystore's SHA-1, not the debug one). |
| Supabase: audience / `Unacceptable audience` error | Web client ID missing from Supabase's Authorized Client IDs (step 3). |
| "This account is not on the allow-list." | Expected: the Before-User-Created hook rejected the account. Add the email to `allowed_emails`. |
| Recipe extraction / receipt parsing fails only in the app | CORS: the deployed Vercel functions must include `api/_cors.ts` (deploy the branch) — and the app build must be recent enough to use `apiUrl()`. |
| App update won't install | Different signing key (keystore lost?) or lower `versionCode`. Uninstall + reinstall. |
