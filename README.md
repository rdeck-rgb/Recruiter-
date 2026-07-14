# Recruiter Desk Manual & Sourcing System

An **AI Sourcing Architect** web app. Paste a raw, messy job description and the
app calls the Google Gemini API to generate a complete A–Z sourcing playbook:

- **Sourcing Blueprint** (rendered markdown): Role Intent, Boolean Strings
  (tight / broad / Google X-Ray), Target Mapping, Outreach Playbook, Screening &
  Objections, and Backdoor Channels.
- **Interview Scorecard** (interactive): a 3-tier scorecard (Technical,
  Behavioral STAR, Lifestyle & Alignment) with collapsible question cards,
  click-to-copy questions, 1–5 star scoring, and per-question recruiter notes.

## Tech stack

- **Next.js 16** (App Router) + **React 19**
- **Tailwind CSS** (with `@tailwindcss/typography` for the blueprint)
- **lucide-react** icons
- **react-markdown** + **remark-gfm** (tables, fenced code)
- **@google/genai** — Google Gemini API integration

## Getting started

```bash
npm install
cp .env.example .env.local   # then add your GEMINI_API_KEY
npm run dev
```

Open <http://localhost:3000>.

Get a Gemini API key at <https://aistudio.google.com/apikey>.

## How it works

`app/api/analyze/route.ts` is a Next.js route handler that sends the job
description to Gemini (`gemini-2.5-flash`) with a system instruction telling it
to return a strict JSON object (`blueprintMarkdown` + `scorecardData`) and
nothing else, using `responseMimeType: "application/json"`. The route then
defensively extracts and parses the JSON (tolerating stray code fences),
validates the shape, and maps API/auth/rate-limit failures and malformed
responses to clear error messages.

Swap the `MODEL` constant in `app/api/analyze/route.ts` for `gemini-2.5-pro`
if you want higher quality at higher cost.

## Exporting

The results view has a **Copy Blueprint** button (copies the markdown to your
clipboard) and a **Save as PDF** button (triggers the browser print dialog;
print styles hide the app chrome so only the playbook prints).

## Project structure

```
app/
  api/analyze/route.ts   # Gemini API integration (JSON output)
  layout.tsx
  page.tsx               # Dashboard: input, loading state, tabbed results
  globals.css            # Tailwind + print styles
components/
  SourcingBlueprint.tsx  # Markdown renderer (prose styling)
  InterviewScorecard.tsx # Interactive tabbed/accordion scorecard
lib/
  types.ts               # Shared payload types
```
