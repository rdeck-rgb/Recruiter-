# Recruiter Desk Manual & Sourcing System

An **AI Sourcing Architect** web app. Paste a raw, messy job description and the
app calls the Claude API to generate a complete A–Z sourcing playbook:

- **Sourcing Blueprint** (rendered markdown): Role Intent, Boolean Strings
  (tight / broad / Google X-Ray), Target Mapping, Outreach Playbook, Screening &
  Objections, and Backdoor Channels.
- **Interview Scorecard** (interactive): a 3-tier scorecard (Technical,
  Behavioral STAR, Lifestyle & Alignment) with collapsible question cards,
  click-to-copy questions, 1–5 star scoring, and per-question recruiter notes.

## Tech stack

- **Next.js 14** (App Router) + **React 18**
- **Tailwind CSS** (with `@tailwindcss/typography` for the blueprint)
- **lucide-react** icons
- **react-markdown** + **remark-gfm** (tables, fenced code)
- **@anthropic-ai/sdk** — Claude API integration

## Getting started

```bash
npm install
cp .env.example .env.local   # then add your ANTHROPIC_API_KEY
npm run dev
```

Open <http://localhost:3000>.

## How it works

`app/api/analyze/route.ts` is a Next.js route handler that sends the job
description to Claude with a system prompt instructing it to return a strict
JSON object (`blueprintMarkdown` + `scorecardData`) and nothing else. The route
then defensively extracts and parses the JSON (tolerating stray code fences),
validates the shape, and maps API/auth/rate-limit failures and malformed
responses to clear error messages.

### A note on the model

The original spec named `claude-3-5-sonnet-20241022`. That model was
**retired on 2025-10-28** and now returns a 404, so this app uses its
documented drop-in replacement, **`claude-sonnet-4-6`** (set via the `MODEL`
constant in `app/api/analyze/route.ts`). Swap it for a different current model
(e.g. `claude-opus-4-8`) if you prefer.

## Exporting

The results view has a **Copy Blueprint** button (copies the markdown to your
clipboard) and a **Save as PDF** button (triggers the browser print dialog;
print styles hide the app chrome so only the playbook prints).

## Project structure

```
app/
  api/analyze/route.ts   # Claude API integration (structured JSON output)
  layout.tsx
  page.tsx               # Dashboard: input, loading state, tabbed results
  globals.css            # Tailwind + print styles
components/
  SourcingBlueprint.tsx  # Markdown renderer (prose styling)
  InterviewScorecard.tsx # Interactive tabbed/accordion scorecard
lib/
  types.ts               # Shared payload types
```
