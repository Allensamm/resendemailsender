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

## Sent mail status

Sent mail checks Resend’s latest event for each saved receipt when you visit the tab, every minute while visible, and when you select **Refresh**. It uses the existing inbox sign-in. A new receipt initially shows **Accepted**. Resend can later report **Sent**, **Delivered**, **Opened**, **Clicked**, **Reported as spam**, a delay, or a delivery failure. Each label describes the message as a whole. **Delivered** confirms acceptance by the destination mail server. Automatic spam-folder placement is private to the receiving provider.

New sends include an escaped HTML copy alongside the original plain text. To receive open events, enable open tracking in the sending domain’s Resend configuration. **Opened** means the tracking image loaded. Image blockers and privacy proxies can affect this signal. Earlier plain-text-only sends can still show delivery and complaint events. [Resend tracking setup](https://resend.com/docs/dashboard/domains/tracking)

## Replies

Open `/replies` or select **Replies** in the navigation. Set the following Production variables in Vercel and redeploy.

- **INBOX_PASSWORD** is a new password from your password manager. Save it as a Sensitive variable. Enter it on the Replies page to open the inbox. The app remembers the browser with a persistent HTTP-only cookie and renews it during use. Select **Log out** or clear this site’s browser data to end the saved sign-in. Changing the inbox password invalidates existing sessions.
- New emails sent from `sovernpartners.com` direct replies to `replies@kronaesaex.resend.app`. The Replies inbox reads that same address. Set **RESEND_REPLY_TO** only to override the receiving address. Other sender domains default to their sender mailbox.
- The existing **RESEND_API_KEY** must have Full access for the server to read received mail. An in-place permission change uses the same key.

The **Replies** tab shows an unread badge while the inbox is unlocked. It checks every 30 seconds on visible pages and when you return to the app. Opening a reply marks it as read in this browser. The count displays up to **99+**. Use **Refresh** to update the message list. The message list and detail endpoint are both password-protected and scoped to the receiving address. Messages stay in Resend and appear as plain text in the browser. Replies to older mail go to the address in the original message. Mail delivered to an existing external mailbox appears here only if it is forwarded to the configured receiving address. [Resend receiving setup](https://resend.com/docs/dashboard/receiving/introduction)

### Reply in a conversation

Open an incoming message and choose **Reply**. Check the displayed recipient, write your response and select **Send reply**. The server reads the original message from the protected inbox and uses its Reply-To or From address. Each response carries the original Internet Message-ID in In-Reply-To and preserves the References chain and subject. Further replies return to the same receiving mailbox. The conversation view includes responses saved in this browser’s Sent mail history. Incoming replies are grouped by their Internet Message-ID, References and In-Reply-To headers, with earlier messages shown as chat bubbles. Matching subjects alone never merge conversations. Use **Load older messages** to include earlier pages in grouping. Messages without thread headers remain separate. [Resend threading guide](https://resend.com/docs/dashboard/receiving/reply-to-emails)

## Private Sites configuration

Keep the Site owner-private. Its access policy controls who can use the send endpoint. Configure `RESEND_API_KEY` as a runtime secret and `RESEND_FROM` as a runtime variable, then redeploy. For a deployment outside private Sites, protect the entire app and its API with authentication before exposing it to the internet.

## Verification

```sh
node --experimental-strip-types --test tests/*.test.mjs
npm run build
```

The tests use a mock provider. A successful send returns Resend's email ID and indicates acceptance for delivery.


Use the trash button on a conversation or **Delete** beneath a message to hide it in this browser. **Undo** restores the last deletion until you leave or reload the page. Hidden incoming messages do not contribute to the unread badge. Hidden outgoing messages are also omitted from Sent mail, while retained receipt data can still connect future replies. Deletions are local browser markers, not Resend API deletions, and do not synchronize to other devices. Clearing site data restores hidden messages from Resend. New replies to a hidden conversation appear normally.
