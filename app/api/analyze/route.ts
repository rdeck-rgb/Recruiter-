import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import type { DeskManual } from "@/lib/types";

// This route calls the Claude API, which can take a while on large jobs — give
// it room beyond the default serverless budget.
export const maxDuration = 120;
export const runtime = "nodejs";

// NOTE ON MODEL CHOICE:
// The original spec named `claude-3-5-sonnet-20241022`, but that model was
// retired on 2025-10-28 and now returns a 404. Its documented drop-in
// replacement is `claude-sonnet-4-6`, which is what we use here.
const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are an elite Executive Recruiter and Sourcing Architect. Analyze the provided job description. Output a JSON object with two keys: \`blueprintMarkdown\` and \`scorecardData\`.

For \`blueprintMarkdown\`, write a highly detailed markdown manual with exactly these sections:

1. ROLE INTENT: Decode what this role actually is behind the corporate jargon. Define the 2 primary target candidate profiles.

2. BOOLEAN STRINGS: Generate 1 Tight, 1 Broad, and 1 Google X-Ray string. Put each Boolean string in a fenced code block so it can be copied cleanly.

3. TARGET MAPPING: Categorize and list real-world target companies, competitors, and adjacencies.

4. OUTREACH PLAYBOOK: Provide 1 sub-300 character LinkedIn note and a 3-part email sequence customized for each candidate profile.

5. SCREENING & OBJECTIONS: Provide 3 technical disqualifying questions and an objection-handling table (use a markdown table).

6. BACKDOOR CHANNELS: Identify alternative sourcing channels (trade events, publications, academic programs).

For \`scorecardData\`, generate exactly 3 tiers of interview questions (Tech, Behavioral, Lifestyle) based on the job text. Each tier must have an array of question objects containing 'id', 'question', 'lookFor', and 'redFlags'. Use ids like t1_q1, t1_q2, t2_q1, etc. Generate 3-5 questions per tier.

The exact JSON shape you must return is:
{
  "blueprintMarkdown": "string (full markdown manual for sections 1-6)",
  "scorecardData": {
    "tier1": { "title": "string", "description": "string", "questions": [ { "id": "string", "question": "string", "lookFor": "string", "redFlags": "string" } ] },
    "tier2": { "title": "string", "description": "string", "questions": [ ... ] },
    "tier3": { "title": "string", "description": "string", "questions": [ ... ] }
  }
}

CRITICAL OUTPUT RULES: Respond with ONLY the raw JSON object. Do not wrap it in markdown code fences. Do not add any text before or after the JSON. The response must be parseable by JSON.parse().`;

// Pull the JSON object out of the model's text, tolerating accidental markdown
// code fences or stray prose around it.
function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return trimmed;
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Server is missing ANTHROPIC_API_KEY. Set it in your environment (.env.local)." },
      { status: 500 },
    );
  }

  let jobDescription: string;
  try {
    const body = await req.json();
    jobDescription = typeof body?.jobDescription === "string" ? body.jobDescription : "";
  } catch {
    return NextResponse.json({ error: "Invalid request body. Expected JSON." }, { status: 400 });
  }

  if (!jobDescription.trim()) {
    return NextResponse.json(
      { error: "Please paste a job description before generating." },
      { status: 400 },
    );
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let rawText: string;
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Here is the raw job description to analyze:\n\n<job_description>\n${jobDescription}\n</job_description>`,
        },
      ],
    });

    if ((response.stop_reason as string) === "refusal") {
      return NextResponse.json(
        { error: "The model declined to analyze this content. Try a different job description." },
        { status: 422 },
      );
    }

    const textBlock = response.content.find((b) => b.type === "text");
    rawText = textBlock && textBlock.type === "text" ? textBlock.text : "";

    if (!rawText) {
      return NextResponse.json(
        { error: "The model returned an empty response. Please try again." },
        { status: 502 },
      );
    }
  } catch (err) {
    // Map common Anthropic SDK errors to clear messages.
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "Invalid Anthropic API key." }, { status: 500 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "Rate limited by the Anthropic API. Wait a moment and try again." },
        { status: 429 },
      );
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Anthropic API error (${err.status ?? "?"}): ${err.message}` },
        { status: 502 },
      );
    }
    console.error("Unexpected error calling Anthropic:", err);
    return NextResponse.json({ error: "Unexpected server error while contacting the AI." }, { status: 500 });
  }

  // Defensive parse + shape validation: strip any fences/prose, then parse.
  let data: DeskManual;
  try {
    data = JSON.parse(extractJson(rawText)) as DeskManual;
  } catch {
    return NextResponse.json(
      { error: "The AI returned malformed JSON. Please try again." },
      { status: 502 },
    );
  }

  if (
    !data?.blueprintMarkdown ||
    !data?.scorecardData?.tier1 ||
    !data?.scorecardData?.tier2 ||
    !data?.scorecardData?.tier3
  ) {
    return NextResponse.json(
      { error: "The AI response was missing required sections. Please try again." },
      { status: 502 },
    );
  }

  return NextResponse.json(data);
}
