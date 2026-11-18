# Letterpress

A private email composer powered by Resend. The browser sends recipient addresses, subject, and plain text to the server. Only the server contacts Resend. Drafts and the last 30 accepted messages are stored in the current browser.

## Run locally

Use Node.js 22.13 or newer.

```sh
npm ci
cp .env.example .dev.vars
npm run dev
```

Put your key in `RESEND_API_KEY` in the ignored `.dev.vars` file. Set `RESEND_FROM` to your sender address and restart the dev server. The default sender, `onboarding@resend.dev`, is for tests sent to your Resend account email. To send to other recipients, use a sender on your verified domain.

## Hosted configuration

Keep the Site owner-private. Its access policy controls who can use the send endpoint. Configure `RESEND_API_KEY` as a runtime secret and `RESEND_FROM` as a runtime variable, then redeploy. For a deployment outside private Sites, protect the entire app and its API with authentication before exposing it to the internet.

## Verification

```sh
node --experimental-strip-types --test tests/send-email.test.mjs
npm run build
```

The tests use a mock provider. A successful send returns Resend's email ID and indicates acceptance for delivery.
