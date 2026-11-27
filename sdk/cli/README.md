# Delivrie CLI

Send email and manage your [Delivrie](https://delivrie.io) account from the terminal: domains, API keys, webhooks,
templates, contacts, suppressions and logs. No dependencies; needs Node.js 18 or later.

```sh
npm install -g delivrie-cli     # or run any command with npx delivrie-cli
delivrie login                  # paste an API key from https://delivrie.io/api-keys
delivrie send -f "Acme <hi@acme.com>" -t ada@example.com -s "Hello" --text "It works"
```

## Commands

| Command | What it does |
| --- | --- |
| `delivrie login` / `logout` / `whoami` | Save, remove or check the API key |
| `delivrie usage` | Plan, emails sent this month and today |
| `delivrie send` | Send an email: HTML, text, a template, attachments, tags, headers, scheduling |
| `delivrie emails list\|get\|cancel\|reschedule` | Recent emails, one email's events, change a scheduled email |
| `delivrie domains list\|add\|get\|verify\|delete` | Add a domain, see its DNS records, check DNS |
| `delivrie keys list\|create\|delete` | API keys (`--sending` for a sending-only key) |
| `delivrie webhooks list\|create\|test\|deliveries` | Endpoints, test events, delivery attempts |
| `delivrie templates list\|get\|publish` | Templates by id or alias |
| `delivrie contacts list\|add\|get\|delete` | Contacts by id or email |
| `delivrie suppressions list\|add\|remove` | Addresses Delivrie won't send to |
| `delivrie logs list\|get` | API request logs |

Run `delivrie <command> --help` for options. Add `--json` to any command for the raw API response, which makes the
CLI easy to script:

```sh
id=$(delivrie send -f hi@acme.com -t ada@example.com -s Hi --text Hi -q)
delivrie emails get "$id" --json | jq .last_event
cat welcome.html | delivrie send -f hi@acme.com -t ada@example.com -s Welcome --html-file -
delivrie send -t ada@example.com --template welcome --var name=Ada
```

## Keys and settings

`delivrie login` saves the key in `~/.config/delivrie/config.json` (readable only by you). In CI, set
`DELIVRIE_API_KEY` instead; it always wins over the saved key. `--api-key` overrides both for one command.
`DELIVRIE_BASE_URL` or `--base-url` points the CLI at another API address.

Sends always carry an idempotency key, so a retried send never goes out twice; pass `--idempotency-key` to choose it.
Deleting asks for confirmation; `--yes` skips the question in scripts.

Exit codes: `0` success, `1` the API returned an error, `2` the command was used wrongly.

Docs: https://delivrie.io/docs/cli
