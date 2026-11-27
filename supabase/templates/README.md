# Supabase Auth email templates

Generated from the shared email design (`supabase/functions/_shared/emails.ts`, Figma "Email · Headers") by
`node --experimental-strip-types tools/build_auth_emails.ts`. Don't edit the HTML by hand; change the builder and regenerate.

Paste each file into **Supabase → Authentication → Emails → Templates**, with its subject:

| Supabase template | Subject | File |
|---|---|---|
| Confirm signup | Verify your email address | `confirmation.html` |
| Invite user | You’ve been invited to Delivrie | `invite.html` |
| Magic link | Your Delivrie sign-in code | `magic_link.html` |
| Change email address | Confirm your new email address | `email_change.html` |
| Reset password | Reset your Delivrie password | `recovery.html` |
| Reauthentication | Your Delivrie verification code | `reauthentication.html` |

Sender: in **Supabase → Authentication → Emails → SMTP settings**, set the sender name to **Matthew from Delivrie**.

Images are PNGs on delivrie.io (`assets/email-logo.png`, `assets/email/*.png`) because Gmail and Outlook don't display SVG.
