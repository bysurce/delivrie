---
title: AI writing
group: Sending
order: 3.5
description: Write emails with AI in Delivrie's editor: draft from a web page or a brief in your brand voice, rewrite selected blocks, get subject lines, and let agents like Claude edit an email live while you watch.
---
The email editor for [broadcasts](/docs/broadcasts) and [templates](/docs/templates) can write with you. Open an email and choose **AI** in the top bar.

## Write from a page or a brief

Choose **Write from a page** and paste a link to a blog post, changelog, product or event page. Delivrie reads the page and writes an email from its facts, links and images. Or choose **Write from a brief** and say what the email is for. You can give both, plus a length and a tone.

The draft replaces the email's content but keeps your logo and, in broadcasts, your unsubscribe footer. Buttons use your [brand kit](https://delivrie.io/settings/brand) colour. Everything stays editable, and **Undo** puts back what was there before.

The AI only uses links and facts from the page or your brief. Check prices, dates and links before you send: the draft notes anything worth a second look.

## Rewrite blocks

Select a block and choose the sparkle button in the side panel, or **AI → Rewrite**. Shift-click to select several blocks, or select none to rewrite the whole email. Pick **Shorter**, **Clearer**, **Friendlier**, **More formal**, **Punchier** or **Fix grammar**, or type your own instruction, like "add a line about the free trial". Variables like `{{first_name}}`, links and block styles are kept.

**AI → Suggest subject lines** gives five subject lines (with preview text for broadcasts) based on what the email says.

## Brand voice

In [Settings → Brand voice](https://delivrie.io/settings/brand-voice), describe how your company writes: tone, sentence length, words you use and avoid, who your readers are. Or enter your website and choose **Suggest from website**. Every draft, rewrite and subject line follows it. Team admins can change it.

## Let agents edit live

An agent connected to the [MCP server](/docs/mcp) (Claude, Cursor, Codex, ChatGPT and others) can edit a template or draft broadcast while you have it open. Its changes appear in the editor within a few seconds, highlighted, with its name in the top bar and a note on what it changed. **Undo** reverts them. If you're in the middle of typing, Delivrie asks before loading them.

The agent uses two tools: `get_email_content` to read the blocks with their ids, and `edit_email_content` to change them one at a time. Try:

```text
Open my Delivrie broadcast "November update" and make the intro friendlier.
Add a callout after the first paragraph about the Black Friday discount (20% off Pro until Dec 1).
Keep everything else.
```

`ai_draft_email` lets an agent use Delivrie's AI writer too, optionally writing straight into an email with `target`.

## API

| Request | What it does |
| --- | --- |
| `POST /ai/draft` | Write an email from `url` and/or `brief`. Optional `kind` (`broadcast` or `template`), `length` (`short`, `medium`, `long`), `tone`, `variables`, and `target: { type, id }` to write it into a template or draft broadcast |
| `POST /ai/rewrite` | Rewrite `blocks` with an `instruction` |
| `POST /ai/subjects` | Subject line ideas for an email's `text` |
| `GET` / `PUT /ai/voice` | Read or set the brand voice (`{ "voice": "…" }`) |
| `GET /templates/:id/content`, `GET /broadcasts/:id/content` | An email's subject and blocks with ids |
| `POST /templates/:id/content`, `POST /broadcasts/:id/content` | Edit it: `ops`, or `blocks` to replace them all, plus `subject`, `preview_text` and a `summary` shown in the editor |

Each op is one of:

```json
{ "op": "replace", "id": "b3", "block": { "type": "text", "html": "New paragraph" } }
{ "op": "update", "id": "b3", "set": { "html": "Changed text" } }
{ "op": "insert", "after": "b3", "block": { "type": "button", "text": "Read more", "href": "https://acme.com/blog" } }
{ "op": "delete", "id": "b4" }
{ "op": "move", "id": "b5", "before": "b2" }
```

`after: null` inserts at the top. Block types: `title`, `heading`, `eyebrow`, `text`, `bulleted`, `numbered`, `callout`, `button`, `image`, `rows`, `divider`, `spacer`, `otp` (templates) and `footer` (broadcasts). Text fields take inline HTML: `<b>`, `<i>`, `<u>`, `<a href>` and `<br>`. Template edits are saved as a draft until you publish.

## Limits

AI writing requests (drafts, rewrites, subject lines and brand voice suggestions) a month: Free 30, Starter 300, Pro 1,000, Scale 3,000, Enterprise unlimited. Edits through `edit_email_content` and the content API don't count.
