# Android companion photo transport

LoanPro SaaS reuses the existing mobile companion Cloud Run service only for
pairing, FCM notification, and temporary image transfer. Cloud Run and its
MongoDB database are not permanent photo storage. The existing loan workflow
converts the completed relay image to a browser `File`, compresses it, uploads
it to the private R2 bucket, and records its metadata in Supabase.

## Data flow

1. An owner opens Settings > Preferences > Paired phone capture.
2. The SaaS server creates a short-lived Cloud Run pairing token and returns a
   server-generated QR image.
3. LoanPro Mobile Companion scans the QR and registers its FCM token in the
   existing Cloud Run service. The Supabase tenant UUID is used as `shopId`.
4. A desktop capture request goes from an authenticated SaaS API route to Cloud
   Run. The browser never receives the Cloud Run API key.
5. Cloud Run sends FCM to the selected/default Android device.
6. The Android app compresses and temporarily uploads the image to Cloud Run.
7. The SaaS server polls the relay, validates the completed image, and returns
   it to the signed-in browser.
8. The existing loan photo flow uploads the image to R2 and writes
   `loan_photos`. The SaaS then deletes the Cloud Run capture session.

## LoanPro SaaS environment

These values are server-only:

```env
MOBILE_CAPTURE_API_BASE_URL=https://SERVICE-ID-REGION.run.app
MOBILE_CAPTURE_API_KEY=ROTATED_API_AUTH_TOKEN_FROM_CLOUD_RUN
```

`MOBILE_CAPTURE_API_BASE_URL` must not end in `/`. Never use a `NEXT_PUBLIC_`
prefix for either value.

## Existing Cloud Run environment

The existing relay requires:

```env
NODE_ENV=production
MONGO_URI=mongodb+srv://...
API_AUTH_TOKEN=LONG_RANDOM_ROTATED_SECRET
PAIR_TOKEN_TTL_MS=300000
CAPTURE_PENDING_TTL_MS=60000
CAPTURE_COMPLETED_TTL_MS=600000
MAX_IMAGE_BYTES=204800
CAPTURE_RATE_LIMIT_WINDOW_MS=10000
CAPTURE_RATE_LIMIT_MAX=30
FCM_PROJECT_ID=...
FCM_CLIENT_EMAIL=...
FCM_PRIVATE_KEY=...
ALLOWED_ORIGINS=https://YOUR-SAAS-DOMAIN
```

The value of `API_AUTH_TOKEN` must equal the SaaS
`MOBILE_CAPTURE_API_KEY`. Store MongoDB, API-token, and Firebase values in
Google Secret Manager rather than source-controlled `.env` or example files.

The Android app calls Cloud Run directly after pairing, so the current service
must remain reachable by the mobile client. The application's `API_AUTH_TOKEN`
middleware still protects `/api/*`; `/health` remains public.

## Verification

1. Confirm `GET <cloud-run-url>/health` returns `status: ok`.
2. Run `npm run check:env` in `loanpro_saas`.
3. Sign in as an owner and create a pairing QR.
4. Scan it with the existing Android companion and confirm the phone appears.
5. Set it as default, rename it, and refresh Settings.
6. Start a loan photo capture on desktop and accept the FCM notification.
7. Confirm the preview appears in SaaS.
8. Save the loan and confirm the final object is under
   `<tenant>/loans/<loan>/<stage>/...` in R2 and a matching `loan_photos` row
   exists.
9. Confirm the temporary Cloud Run capture session is removed after success or
   cancellation.

## Compatibility/security note

The existing Android application requires `backendUrl` and `apiKey` inside its
pairing QR, matching the Electron implementation. Consequently a person who is
allowed to display and decode the pairing QR can recover the shared Cloud Run
API token. Pairing is therefore owner-only in SaaS.

A later hardening phase should replace the shared QR secret with a per-device
credential returned when the one-time pairing token is consumed. That requires
a backwards-compatible Cloud Run and Android application update; it is not
needed to operate the current companion build.
