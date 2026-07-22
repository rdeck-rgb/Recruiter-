# Email Warm-up Automation

Gradually builds sending reputation across your Google Workspace mailboxes so
that, by the time you send real mail, the domains have a healthy track record
(mail lands in the inbox instead of spam).

It is a single, dependency-free Python script (`warmup.py`) that runs **once a
day** — easiest via the included GitHub Actions workflow, or via `cron` on any
machine.

---

## What it does each day, per mailbox

1. **Sends** a gradually increasing number of natural-looking emails to your
   other warm-up mailboxes and to your seed inboxes.
2. **Replies** to a portion of received warm-up mail (real, threaded
   conversations — a strong positive signal).
3. **Rescues** any warm-up mail that landed in **Spam**: marks it *not spam* and
   moves it to the Inbox.
4. **Stars** warm-up mail (engagement signal).

Every message carries a hidden `X-Warmup-Token` header, so the script only ever
touches its **own** messages. It never reads, moves, or replies to your real
email.

The daily volume ramps automatically:
`min_per_account + ramp_step × (days since start_date)`, capped at
`max_per_account`. Defaults: start at **2/day**, add **2/day**, cap at
**20/day**.

---

## ⚠️ Security first

- If you ever pasted your mailbox **login passwords** anywhere, **change them now**.
- This tool authenticates with **Google App Passwords**, not your login
  password. Real credentials live only in a **GitHub Actions secret** (or a
  local `accounts.json`, which is git-ignored). They are **never committed**.

---

## Step 1 — Create a Google App Password for each mailbox

App Passwords require **2-Step Verification** to be ON for the account.

For each of the 15 mailboxes:

1. Sign in to that mailbox at <https://myaccount.google.com>.
2. **Security → 2-Step Verification** → turn it on (if it isn't already).
3. Go to <https://myaccount.google.com/apppasswords>.
4. Create an app password named e.g. `warmup`. Google shows a 16-character
   code like `abcd efgh ijkl mnop`.
5. Copy that code — that's the `app_password` for this mailbox.

> If your Workspace admin has disabled App Passwords, enable it in the
> **Admin console → Security → Less secure apps / App passwords**, or switch to
> OAuth (not covered by this simple script). Also make sure **IMAP is enabled**
> (Gmail → Settings → Forwarding and POP/IMAP → Enable IMAP), which it is by
> default for Workspace.

---

## Step 2 — Build your config JSON

Start from `accounts.example.json` (your mailboxes and seeds are already filled
in). Replace every `REPLACE_WITH_APP_PASSWORD` with the real 16-char app
password for that mailbox. Spaces are fine — the script strips them.

Tunable fields:

| Field                   | Meaning                                            | Default |
|-------------------------|----------------------------------------------------|---------|
| `start_date`            | Day the ramp starts (ISO date)                     | today   |
| `min_per_account`       | Emails/mailbox on day 1                             | 2       |
| `max_per_account`       | Cap on emails/mailbox/day                           | 20      |
| `ramp_step`             | Extra emails/mailbox added each day                 | 2       |
| `reply_probability`     | Chance of replying to a given received warm-up mail | 0.4     |
| `max_send_delay_seconds`| Random pause between sends (human-like pacing)      | 12      |
| `seed_recipients`       | External inboxes to also send to                   | (yours) |
| `token`                 | Tag identifying this tool's mail                   | set     |

---

## Step 3a — Run it automatically with GitHub Actions (recommended)

No server, no laptop that has to stay on.

1. In GitHub: **Settings → Secrets and variables → Actions → New repository
   secret**.
2. Name: `WARMUP_CONFIG_JSON`. Value: paste the **entire** config JSON (with
   real app passwords).
3. That's it. The workflow in `.github/workflows/email-warmup.yml` runs daily at
   14:15 UTC.

**Test it now without sending anything:** Actions tab → *Email Warm-up* → *Run
workflow* → check **dry_run** → Run. Read the logs to confirm every mailbox
authenticates. Then run again with dry_run off (or just wait for the daily
schedule).

> GitHub's scheduled runs are UTC and best-effort — they can start a few minutes
> late. That's fine for warm-up.

---

## Step 3b — Or run it locally with cron

```bash
cd warmup
cp accounts.example.json accounts.json   # then edit in your app passwords
python3 warmup.py                          # one run

# Dry run (no sends / no moves), just logs what it would do:
WARMUP_DRY_RUN=1 python3 warmup.py
```

Add to crontab for a daily 9:05am run:

```cron
5 9 * * *  cd /path/to/repo/warmup && /usr/bin/python3 warmup.py >> warmup.log 2>&1
```

(`accounts.json` is git-ignored, so it won't be committed.)

---

## Good-practice notes

- **Start slow, ramp slow.** The defaults are conservative. Don't crank
  `max_per_account` to hundreds on day one — that looks unnatural and hurts you.
- **Keep it running for several weeks** before relying on the domains for real
  outreach; reputation builds gradually.
- **Warm-up ≠ permission to spam.** Reputation you build can be destroyed
  instantly by unsolicited bulk mail, spam complaints, or hitting spam traps.
  Only send real mail to people who expect to hear from you, honor opt-outs, and
  keep complaint rates low. Set up **SPF, DKIM, and DMARC** on every domain —
  warm-up can't compensate for missing authentication.
- **One tool, one token.** All mailboxes share a `token` so they recognize each
  other's warm-up mail. Keep it consistent.

---

## Files

```
warmup/
  warmup.py               # the automation (stdlib only, Python 3.9+)
  accounts.example.json   # config template (your mailboxes + seeds pre-filled)
  accounts.json           # your real config (git-ignored — you create this)
  README.md               # this file
.github/workflows/
  email-warmup.yml        # daily scheduled run
```
