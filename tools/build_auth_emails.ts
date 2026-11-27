// Writes the Supabase Auth email templates (supabase/templates/*.html) from the shared email design, so sign-up,
// sign-in and password emails look like every other Delivrie email. Run:
//   node --experimental-strip-types tools/build_auth_emails.ts
import { writeFileSync } from "node:fs";
import { authEmails } from "../supabase/functions/_shared/emails.ts";
for (const [name, build] of Object.entries(authEmails)) {
  const r = build();
  writeFileSync(new URL(`../supabase/templates/${name}.html`, import.meta.url), r.html);
  console.log(`${name}.html  subject: ${r.subject}`);
}
