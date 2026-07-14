"use client";

import { useState } from "react";
import {
  Loader2,
  Sparkles,
  FileText,
  ClipboardList,
  Copy,
  Check,
  Printer,
  AlertCircle,
} from "lucide-react";
import SourcingBlueprint from "@/components/SourcingBlueprint";
import InterviewScorecard from "@/components/InterviewScorecard";
import type { DeskManual } from "@/lib/types";

type View = "blueprint" | "scorecard";

export default function Home() {
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeskManual | null>(null);
  const [view, setView] = useState<View>("blueprint");
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!jobDescription.trim() || loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription }),
      });

      const payload = await res.json();

      if (!res.ok) {
        setError(payload?.error ?? "Something went wrong. Please try again.");
        return;
      }

      setResult(payload as DeskManual);
      setView("blueprint");
    } catch {
      setError("Network error — could not reach the server. Check your connection and retry.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyBlueprint = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.blueprintMarkdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Unable to copy to clipboard in this browser context.");
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
      {/* Header */}
      <header className="no-print mb-8 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-indigo-100 px-4 py-1.5 text-sm font-medium text-indigo-700">
          <Sparkles size={16} />
          Recruiter Desk Manual &amp; Sourcing System
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          AI Sourcing Architect
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-slate-600">
          Paste a raw, messy job description. Get a complete A–Z sourcing playbook —
          Boolean strings, target companies, outreach sequences, and an interactive
          3-tier interview scorecard.
        </p>
      </header>

      {/* Input */}
      <section className="no-print mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <label
          htmlFor="jd"
          className="mb-2 block text-sm font-semibold text-slate-700"
        >
          Raw Job Description
        </label>
        <textarea
          id="jd"
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          rows={10}
          placeholder="Paste the full job description here — corporate jargon and all…"
          className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm leading-relaxed shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          disabled={loading}
        />

        <div className="mt-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-400">
            {jobDescription.trim().length.toLocaleString()} characters
          </p>
          <button
            onClick={handleGenerate}
            disabled={loading || !jobDescription.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Generating Desk Manual…
              </>
            ) : (
              <>
                <Sparkles size={18} />
                Generate Desk Manual
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}
      </section>

      {/* Results */}
      {result && (
        <section className="print-area">
          {/* View toggle + actions */}
          <div className="no-print mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
              <button
                onClick={() => setView("blueprint")}
                className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  view === "blueprint"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <FileText size={16} />
                Sourcing Blueprint
              </button>
              <button
                onClick={() => setView("scorecard")}
                className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  view === "scorecard"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <ClipboardList size={16} />
                Interview Scorecard
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyBlueprint}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
              >
                {copied ? (
                  <>
                    <Check size={16} className="text-green-600" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy size={16} />
                    Copy Blueprint
                  </>
                )}
              </button>
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
              >
                <Printer size={16} />
                Save as PDF
              </button>
            </div>
          </div>

          {/* Active view */}
          {view === "blueprint" ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <SourcingBlueprint markdown={result.blueprintMarkdown} />
            </div>
          ) : (
            <InterviewScorecard data={result.scorecardData} />
          )}
        </section>
      )}
    </main>
  );
}
