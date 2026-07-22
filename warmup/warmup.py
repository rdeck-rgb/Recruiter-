#!/usr/bin/env python3
"""
Email warm-up automation for Google Workspace mailboxes.

Zero external dependencies (Python 3.9+ standard library only).

What it does on each daily run, for every configured mailbox:
  1. SEND  - sends a gradually increasing number of natural-looking warm-up
             emails to the other warm-up mailboxes and to your seed inboxes.
  2. REPLY - reads incoming warm-up mail and replies to a portion of it, so
             conversations look real (threaded with In-Reply-To/References).
  3. RESCUE- finds warm-up mail sitting in Spam, marks it "not spam" and moves
             it to the Inbox (a strong positive signal to the provider).
  4. STAR  - flags/stars warm-up mail (another positive engagement signal).

Every warm-up message carries an X-Warmup-Token header so the tool only ever
touches its OWN messages -- it never reads, moves, or replies to your real mail.

Configuration comes from a JSON blob (never commit real credentials):
  - env WARMUP_CONFIG_JSON   -> the JSON itself (use this in GitHub Actions), OR
  - env WARMUP_CONFIG_FILE   -> path to a JSON file (default: warmup/accounts.json)

See accounts.example.json for the schema and warmup/README.md for setup.
"""

from __future__ import annotations

import email
import email.utils
import imaplib
import json
import logging
import os
import random
import smtplib
import ssl
import sys
import time
from datetime import date, datetime, timezone
from email.header import decode_header, make_header
from email.message import EmailMessage

# --------------------------------------------------------------------------- #
# Constants
# --------------------------------------------------------------------------- #

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 465  # implicit TLS
IMAP_HOST = "imap.gmail.com"
IMAP_PORT = 993
GMAIL_SPAM = "[Gmail]/Spam"

WARMUP_HEADER = "X-Warmup"
TOKEN_HEADER = "X-Warmup-Token"
SUBJECT_TAG = "[warmup]"  # human-invisible-ish tag kept in subject for filtering

# --------------------------------------------------------------------------- #
# Content pools (kept generic & professional)
# --------------------------------------------------------------------------- #

SUBJECTS = [
    "Quick question about next week",
    "Following up on our chat",
    "Notes from earlier",
    "Re: schedule",
    "Checking in",
    "Draft for your review",
    "Availability this week?",
    "Thoughts on the plan",
    "Update on my end",
    "Recap + next steps",
    "One small thing",
    "Time to sync?",
]

OPENERS = [
    "Hi {first},",
    "Hey {first},",
    "Hello {first},",
    "{first} -",
    "Hi there {first},",
]

BODIES = [
    "Hope your week is going well. Wanted to circle back on the item we "
    "discussed and make sure we're aligned before things move forward.",
    "Thanks for the note earlier. I put together a short summary of where "
    "things stand and what I think the next couple of steps should be.",
    "Just a quick check-in. Let me know if there's anything you need from me "
    "on this, happy to help move it along.",
    "I reviewed the details and everything looks good on my end. Let me know "
    "if any of the timing needs to shift and we'll adjust.",
    "Appreciate you following up. I'll get the remaining pieces wrapped up "
    "today and send an update once it's done.",
    "Wanted to loop you in before I go any further. If this direction works "
    "for you I'll keep going, otherwise happy to rework it.",
]

CLOSERS = [
    "Best,\n{first}",
    "Thanks,\n{first}",
    "Talk soon,\n{first}",
    "Cheers,\n{first}",
    "Appreciate it,\n{first}",
]

REPLY_BODIES = [
    "Thanks for this, looks good to me. Appreciate you keeping me posted.",
    "Got it, that works. I'll take a look and get back to you shortly.",
    "Perfect, thanks for the update. No changes needed on my side.",
    "Sounds good. Let's keep it moving and I'll follow up if anything comes up.",
    "Great, appreciate the quick turnaround. Talk soon.",
    "Thanks for flagging. I'm on board with the plan as outlined.",
]

# --------------------------------------------------------------------------- #
# Logging
# --------------------------------------------------------------------------- #

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("warmup")


# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #

def _env_bool(name: str, default: bool) -> bool:
    val = os.environ.get(name)
    if val is None:
        return default
    return val.strip().lower() in {"1", "true", "yes", "on"}


def load_config() -> dict:
    raw = os.environ.get("WARMUP_CONFIG_JSON")
    if raw:
        cfg = json.loads(raw)
    else:
        path = os.environ.get("WARMUP_CONFIG_FILE") or os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "accounts.json"
        )
        if not os.path.exists(path):
            log.error(
                "No config found. Set WARMUP_CONFIG_JSON, or create %s "
                "(see accounts.example.json).",
                path,
            )
            sys.exit(2)
        with open(path, "r", encoding="utf-8") as fh:
            cfg = json.load(fh)

    accounts = cfg.get("accounts") or []
    if not accounts:
        log.error("Config has no 'accounts'.")
        sys.exit(2)

    for a in accounts:
        for key in ("name", "email", "app_password"):
            if not a.get(key):
                log.error("Account missing required field '%s': %r", key, a)
                sys.exit(2)
        a["app_password"] = a["app_password"].replace(" ", "")  # Google shows spaces

    cfg["accounts"] = accounts
    cfg.setdefault("seed_recipients", [])
    cfg.setdefault("token", "warmup-" + str(cfg.get("start_date", "shared")))
    cfg.setdefault("start_date", date.today().isoformat())
    cfg.setdefault("min_per_account", 2)
    cfg.setdefault("max_per_account", 20)
    cfg.setdefault("ramp_step", 2)  # extra emails added per day
    cfg.setdefault("reply_probability", 0.4)
    cfg.setdefault("max_send_delay_seconds", 12)
    return cfg


def todays_volume(cfg: dict) -> int:
    """Deterministic daily ramp: min + step * days_since_start, capped at max."""
    try:
        start = date.fromisoformat(str(cfg["start_date"]))
    except ValueError:
        start = date.today()
    days = max(0, (date.today() - start).days)
    vol = cfg["min_per_account"] + cfg["ramp_step"] * days
    return int(max(cfg["min_per_account"], min(cfg["max_per_account"], vol)))


# --------------------------------------------------------------------------- #
# Email construction
# --------------------------------------------------------------------------- #

def _first_name(account: dict) -> str:
    return (account.get("name") or account["email"]).split()[0].strip(",")


def build_message(sender: dict, recipient: str, recipient_first: str,
                  token: str) -> EmailMessage:
    msg = EmailMessage()
    subject = random.choice(SUBJECTS)
    msg["Subject"] = f"{subject} {SUBJECT_TAG}"
    msg["From"] = email.utils.formataddr((sender["name"], sender["email"]))
    msg["To"] = recipient
    msg["Message-ID"] = email.utils.make_msgid(domain=sender["email"].split("@")[-1])
    msg["Date"] = email.utils.formatdate(localtime=True)
    msg[WARMUP_HEADER] = "1"
    msg[TOKEN_HEADER] = token

    opener = random.choice(OPENERS).format(first=recipient_first or "there")
    body = random.choice(BODIES)
    closer = random.choice(CLOSERS).format(first=_first_name(sender))
    msg.set_content(f"{opener}\n\n{body}\n\n{closer}\n")
    return msg


def build_reply(sender: dict, original: email.message.Message,
                token: str) -> EmailMessage | None:
    to_addr = email.utils.parseaddr(original.get("Reply-To")
                                    or original.get("From", ""))[1]
    if not to_addr:
        return None

    msg = EmailMessage()
    orig_subject = str(make_header(decode_header(original.get("Subject", ""))))
    if not orig_subject.lower().startswith("re:"):
        orig_subject = "Re: " + orig_subject
    msg["Subject"] = orig_subject
    msg["From"] = email.utils.formataddr((sender["name"], sender["email"]))
    msg["To"] = to_addr
    msg["Message-ID"] = email.utils.make_msgid(domain=sender["email"].split("@")[-1])
    msg["Date"] = email.utils.formatdate(localtime=True)
    msg[WARMUP_HEADER] = "1"
    msg[TOKEN_HEADER] = token

    orig_id = original.get("Message-ID")
    if orig_id:
        msg["In-Reply-To"] = orig_id
        refs = original.get("References", "")
        msg["References"] = (refs + " " + orig_id).strip()

    reply = random.choice(REPLY_BODIES)
    msg.set_content(f"{reply}\n\n{_first_name(sender)}\n")
    return msg


# --------------------------------------------------------------------------- #
# SMTP / IMAP helpers
# --------------------------------------------------------------------------- #

def smtp_send(sender: dict, msg: EmailMessage, ctx: ssl.SSLContext,
              dry_run: bool) -> bool:
    if dry_run:
        log.info("   [dry-run] %s -> %s | %s",
                 sender["email"], msg["To"], msg["Subject"])
        return True
    try:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ctx, timeout=30) as s:
            s.login(sender["email"], sender["app_password"])
            s.send_message(msg)
        log.info("   sent  %s -> %s", sender["email"], msg["To"])
        return True
    except smtplib.SMTPAuthenticationError:
        log.error("   AUTH FAILED for %s -- check App Password / 2FA.",
                  sender["email"])
        return False
    except Exception as exc:  # noqa: BLE001
        log.error("   send failed %s -> %s: %s", sender["email"], msg["To"], exc)
        return False


def imap_connect(account: dict, ctx: ssl.SSLContext) -> imaplib.IMAP4_SSL | None:
    try:
        M = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT, ssl_context=ctx)
        M.login(account["email"], account["app_password"])
        return M
    except Exception as exc:  # noqa: BLE001
        log.error("   IMAP login failed for %s: %s", account["email"], exc)
        return None


def _search_warmup(M: imaplib.IMAP4_SSL, mailbox: str, token: str) -> list[bytes]:
    try:
        status, _ = M.select(mailbox, readonly=False)
        if status != "OK":
            return []
        status, data = M.search(None, "HEADER", TOKEN_HEADER, token)
        if status != "OK" or not data or not data[0]:
            return []
        return data[0].split()
    except Exception:  # noqa: BLE001
        return []


def process_inbox(account: dict, token: str, reply_prob: float,
                  ctx: ssl.SSLContext, dry_run: bool) -> tuple[int, int, int]:
    """Rescue from spam, star, and reply. Returns (rescued, starred, replied)."""
    M = imap_connect(account, ctx)
    if not M:
        return (0, 0, 0)

    rescued = starred = replied = 0
    try:
        # --- 1. Rescue warm-up mail out of Spam --------------------------- #
        for num in _search_warmup(M, GMAIL_SPAM, token):
            if dry_run:
                rescued += 1
                continue
            try:
                # Copy to Inbox then delete from Spam == "not spam" + move.
                M.copy(num, "INBOX")
                M.store(num, "+FLAGS", "\\Deleted")
                rescued += 1
            except Exception as exc:  # noqa: BLE001
                log.warning("   rescue failed for %s: %s", account["email"], exc)
        if not dry_run:
            try:
                M.expunge()
            except Exception:  # noqa: BLE001
                pass

        # --- 2. In the Inbox: star + selectively reply -------------------- #
        nums = _search_warmup(M, "INBOX", token)
        for num in nums:
            try:
                if not dry_run:
                    M.store(num, "+FLAGS", "\\Flagged")  # star
                starred += 1

                status, msg_data = M.fetch(num, "(RFC822)")
                if status != "OK" or not msg_data or not msg_data[0]:
                    continue
                original = email.message_from_bytes(msg_data[0][1])

                # Don't reply to our own replies (avoid infinite ping-pong).
                subj = str(make_header(decode_header(original.get("Subject", ""))))
                is_reply = subj.lower().startswith("re:")

                if not is_reply and random.random() < reply_prob:
                    reply = build_reply(account, original, token)
                    if reply and smtp_send(account, reply, ctx, dry_run):
                        replied += 1
                if not dry_run:
                    M.store(num, "+FLAGS", "\\Seen")
            except Exception as exc:  # noqa: BLE001
                log.warning("   inbox item failed for %s: %s",
                            account["email"], exc)
    finally:
        try:
            M.logout()
        except Exception:  # noqa: BLE001
            pass
    return (rescued, starred, replied)


# --------------------------------------------------------------------------- #
# Recipient selection
# --------------------------------------------------------------------------- #

def pick_recipients(sender: dict, accounts: list[dict],
                    seeds: list[str], count: int) -> list[tuple[str, str]]:
    """Return list of (address, first_name) excluding the sender itself."""
    pool: list[tuple[str, str]] = []
    for a in accounts:
        if a["email"].lower() != sender["email"].lower():
            pool.append((a["email"], _first_name(a)))
    for s in seeds:
        s = s.strip()
        if s and s.lower() != sender["email"].lower():
            pool.append((s, s.split("@")[0].split(".")[0].capitalize()))

    random.shuffle(pool)
    if count >= len(pool):
        return pool
    return pool[:count]


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #

def main() -> int:
    dry_run = _env_bool("WARMUP_DRY_RUN", False)
    cfg = load_config()
    ctx = ssl.create_default_context()

    accounts = cfg["accounts"]
    seeds = cfg["seed_recipients"]
    token = cfg["token"]
    reply_prob = float(cfg["reply_probability"])
    max_delay = float(cfg["max_send_delay_seconds"])
    volume = todays_volume(cfg)

    log.info("=" * 64)
    log.info("Warm-up run %s  (UTC %s)",
             date.today().isoformat(),
             datetime.now(timezone.utc).strftime("%H:%M"))
    log.info("Mailboxes: %d | seeds: %d | today's volume/mailbox: %d | dry_run=%s",
             len(accounts), len(seeds), volume, dry_run)
    log.info("=" * 64)

    totals = {"sent": 0, "rescued": 0, "starred": 0, "replied": 0, "failed": 0}

    # --- Phase 1: process inboxes (rescue spam, star, reply) -------------- #
    log.info("Phase 1 - reading inboxes (rescue / star / reply)")
    for acc in accounts:
        r, s, rep = process_inbox(acc, token, reply_prob, ctx, dry_run)
        totals["rescued"] += r
        totals["starred"] += s
        totals["replied"] += rep
        if r or s or rep:
            log.info("  %-32s rescued=%d starred=%d replied=%d",
                     acc["email"], r, s, rep)

    # --- Phase 2: send today's fresh warm-up mail ------------------------- #
    log.info("Phase 2 - sending fresh warm-up mail")
    for acc in accounts:
        recipients = pick_recipients(acc, accounts, seeds, volume)
        log.info("  %-32s sending %d", acc["email"], len(recipients))
        for addr, first in recipients:
            msg = build_message(acc, addr, first, token)
            ok = smtp_send(acc, msg, ctx, dry_run)
            totals["sent" if ok else "failed"] += 1
            if not dry_run and max_delay > 0:
                time.sleep(random.uniform(1, max_delay))

    log.info("=" * 64)
    log.info("Done. sent=%d replied=%d rescued=%d starred=%d failed=%d",
             totals["sent"], totals["replied"], totals["rescued"],
             totals["starred"], totals["failed"])
    log.info("=" * 64)

    # Non-zero exit if everything failed (helps surface broken creds in CI).
    if totals["failed"] and totals["sent"] == 0 and not dry_run:
        return 1
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
