import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import type { DeskManual } from "@/lib/types";

// This route calls the Gemini API, which can take a while on large jobs — give
// it room beyond the default serverless budget.
export const maxDuration = 120;
export const runtime = "nodejs";

// Google Gemini model. gemini-2.5-flash is fast and inexpensive and handles
// this structured-generation task well. Swap for "gemini-2.5-pro" if you want
// higher quality at higher cost.
const MODEL = "gemini-2.5-flash";

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

CRITICAL OUTPUT RULES: Respond with ONLY the raw JSON object. Do not wrap it in markdown code fences. Do not add any text before or after the JSON. The response must be parseable by JSON.parse(). Keep the writing focused and avoid unnecessary length so the complete JSON object always fits in the response without being cut off.`;

// Pull the JSON object out of the model's text, tolerating accidental markdown
// code fences or stray prose around it.
//
// NOTE: the blueprint markdown itself contains fenced ``` code blocks (the
// Boolean strings), so we must NOT naively grab the first ``` fence — that would
// match a code block *inside* the JSON. Strategy: parse as-is first (Gemini's
// JSON mode returns clean JSON), then only fall back to fence/brace extraction.
function extractJson(text: string): string {
  const trimmed = text.trim();

  // Fast path: already valid JSON (the normal case with responseMimeType json).
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // fall through to recovery heuristics
  }

  // Whole response wrapped in a single ```json … ``` fence (anchored to start/end
  // so inner code blocks can't match).
  const wholeFence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (wholeFence) return wholeFence[1].trim();

  // Last resort: take everything between the outermost braces.
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return trimmed;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server is missing GEMINI_API_KEY. Set it in your environment (.env.local)." },
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

  const ai = new GoogleGenAI({ apiKey });

  let rawText: string;
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: `Here is the raw job description to analyze:\n\n<job_description>\n${jobDescription}\n</job_description>`,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        // Generous cap so the full manual + scorecard fits without truncation
        // (truncated output = incomplete, unparseable JSON).
        maxOutputTokens: 32000,
        // Disable "thinking" so the full output budget goes to the JSON answer
        // and keeps latency/cost down.
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const finishReason = response.candidates?.[0]?.finishReason;
    rawText = response.text ?? "";

    // If the model hit the output cap, the JSON is incomplete — say so clearly
    // instead of returning a confusing "malformed JSON" error.
    if (finishReason === "MAX_TOKENS") {
      return NextResponse.json(
        {
          error:
            "The generated manual was too long and got cut off. Try a shorter or more focused job description, then generate again.",
        },
        { status: 502 },
      );
    }

    if (!rawText) {
      return NextResponse.json(
        { error: "The model returned an empty response. Please try again." },
        { status: 502 },
      );
    }
  } catch (err) {
    const status = (err as { status?: number })?.status;
    const message = String((err as { message?: unknown })?.message ?? "");

    if (status === 429 || /quota|rate.?limit|resource.?exhausted/i.test(message)) {
      return NextResponse.json(
        { error: "Rate limited / quota exceeded on the Gemini API. Wait a moment and try again." },
        { status: 429 },
      );
    }
    if (
      status === 401 ||
      status === 403 ||
      /api[_ ]?key|permission|unauthor|invalid.?argument/i.test(message)
    ) {
      return NextResponse.json(
        { error: "Invalid Gemini API key or insufficient permissions." },
        { status: 500 },
      );
    }
    console.error("Unexpected error calling Gemini:", err);
    return NextResponse.json(
      { error: `Gemini API error: ${message || "unexpected server error"}` },
      { status: 502 },
    );
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
