# Letterpress

A private email composer powered by Resend. The browser sends recipient addresses, subject, and plain text to the server. Only the server contacts Resend. Drafts and the last 30 accepted messages are stored in the current browser.

## Run locally

Use Node.js 22.13 or newer.

```sh
npm ci
cp .env.example .dev.vars
npm run dev
```

Put your key in `RESEND_API_KEY` in the ignored `.dev.vars` file. Set `RESEND_FROM` to your sender address and restart the dev server. The local development fallback sender, `onboarding@resend.dev`, is for tests sent to your Resend account email. Production requires an explicit sender on your verified domain. Both a missing sender and the Resend test domain are rejected in production.

## Vercel

Deploy the repository root. The checked-in Vercel configuration runs the native Next.js build and serves the composer at `/`. The page loads before Resend credentials are configured. Protect the deployment before enabling email sending, then configure the server variables `RESEND_API_KEY` and `RESEND_FROM` in the Vercel project and redeploy.

## Replies

Open `/replies` or select **Replies** in the navigation. Set the following Production variables in Vercel and redeploy.

- **INBOX_PASSWORD** is a new password from your password manager. Save it as a Sensitive variable. Enter it on the Replies page to open the inbox. Unlocking remembers this browser for seven days using an HTTP-only session cookie. Select **Lock** to end the session.
- New emails sent from `sovernpartners.com` direct replies to `replies@kronaesaex.resend.app`. The Replies inbox reads that same address. Set **RESEND_REPLY_TO** only to override the receiving address. Other sender domains default to their sender mailbox.
- The existing **RESEND_API_KEY** must have Full access for the server to read received mail. An in-place permission change uses the same key.

The **Replies** tab shows an unread badge while the inbox is unlocked. It checks every 30 seconds on visible pages and when you return to the app. Opening a reply marks it as read in this browser. The count displays up to **99+**. Use **Refresh** to update the message list. The message list and detail endpoint are both password-protected and scoped to the receiving address. Messages stay in Resend and appear as plain text in the browser. Replies to older mail go to the address in the original message. Mail delivered to an existing external mailbox appears here only if it is forwarded to the configured receiving address. [Resend receiving setup](https://resend.com/docs/dashboard/receiving/introduction)

## Private Sites configuration

Keep the Site owner-private. Its access policy controls who can use the send endpoint. Configure `RESEND_API_KEY` as a runtime secret and `RESEND_FROM` as a runtime variable, then redeploy. For a deployment outside private Sites, protect the entire app and its API with authentication before exposing it to the internet.

## Verification

```sh
node --experimental-strip-types --test tests/*.test.mjs
npm run build
```

The tests use a mock provider. A successful send returns Resend's email ID and indicates acceptance for delivery.
