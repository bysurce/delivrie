---
title: CLI
group: SDKs and frameworks
order: 1.5
description: The Delivrie command-line tool: send email, check deliveries, add domains and manage keys, webhooks and templates from your terminal or CI.
---
The CLI sends email and manages your account from the terminal. It has no dependencies and needs Node.js 18 or later.

```bash
npm install -g delivrie-cli    # or put npx delivrie-cli in front of any command
delivrie login                 # paste an API key from Dashboard → API keys
```

## Send an email

```bash
delivrie send -f "Acme <hello@mail.acme.com>" -t ada@example.com -s "Hello" --text "It works"
```

The body can come from a file or from another command:

```bash
delivrie send -f hello@mail.acme.com -t ada@example.com -s "Welcome" --html-file welcome.html
cat welcome.html | delivrie send -f hello@mail.acme.com -t ada@example.com -s "Welcome" --html-file -
```

More options: `--cc`, `--bcc` and `--reply-to` (repeatable), `--template welcome --var name=Ada` to send a [template](/docs/templates), `--attach invoice.pdf`, `--tag kind=receipt`, `--header "X-Entity-Ref: 42"` and `--schedule "tomorrow at 9am"`. Every send carries an [idempotency key](/docs/idempotency), so a retried command never sends twice.

## Check what happened

```bash
delivrie emails list
delivrie emails get em_8f2k1q0a        # status and every event
delivrie emails cancel em_8f2k1q0a     # a scheduled email
```

## Domains, keys and webhooks

```bash
delivrie domains add mail.acme.com     # prints the DNS records to add
delivrie domains verify mail.acme.com  # check DNS now
delivrie keys create "CI" --sending    # a sending-only key, shown once
delivrie webhooks create https://acme.com/hooks --events email.delivered,email.bounced
delivrie webhooks test wh_123
```

Domains take a name or an id. Run `delivrie --help` for every command: `templates`, `contacts`, `suppressions`, `logs` and `usage` too.

## Scripts and CI

Add `--json` to any command for the raw API response, and `-q` to `send` to print only the email id:

```bash
id=$(delivrie send -f hello@mail.acme.com -t ada@example.com -s Hi --text Hi -q)
delivrie emails get "$id" --json | jq -r .last_event
```

In CI, set `DELIVRIE_API_KEY` instead of running `login`; it always wins over a saved key. Deleting asks for confirmation; `--yes` skips it in scripts. Exit codes: `0` success, `1` the API returned an error, `2` the command was used wrongly.

`delivrie login` keeps the key in `~/.config/delivrie/config.json`, readable only by you. `delivrie logout` removes it.
