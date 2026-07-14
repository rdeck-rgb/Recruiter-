"use client";

import { useState } from "react";
import {
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  Star,
} from "lucide-react";
import type { ScorecardData, ScorecardQuestion, TierKey } from "@/lib/types";

interface InterviewScorecardProps {
  data: ScorecardData;
}

const TIER_ORDER: TierKey[] = ["tier1", "tier2", "tier3"];

export default function InterviewScorecard({ data }: InterviewScorecardProps) {
  const [activeTab, setActiveTab] = useState<TierKey>("tier1");
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const activeTier = data[activeTab];

  const handleCopy = async (q: ScorecardQuestion) => {
    try {
      await navigator.clipboard.writeText(q.question);
      setCopiedId(q.id);
      setTimeout(() => setCopiedId((cur) => (cur === q.id ? null : cur)), 1500);
    } catch {
      // Clipboard can fail in insecure contexts — fail silently.
    }
  };

  const toggleExpanded = (id: string) =>
    setExpandedQuestion((cur) => (cur === id ? null : id));

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Dark header */}
      <div className="bg-slate-900 px-6 py-5 text-white">
        <h2 className="text-lg font-semibold">Interview Scorecard</h2>
        <p className="mt-1 text-sm text-slate-300">
          Score each candidate 1–5 and capture notes as you interview.
        </p>
      </div>

      {/* Tab navigation */}
      <div className="flex flex-wrap border-b border-slate-200 bg-slate-50">
        {TIER_ORDER.map((key) => {
          const tier = data[key];
          const isActive = key === activeTab;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 min-w-[33%] px-4 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? "border-b-2 border-indigo-600 bg-white text-indigo-700"
                  : "border-b-2 border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {tier.title}
            </button>
          );
        })}
      </div>

      {/* Active tier */}
      <div className="px-4 py-5 sm:px-6">
        <p className="mb-4 text-sm text-slate-600">{activeTier.description}</p>

        <div className="space-y-3">
          {activeTier.questions.map((q) => {
            const isExpanded = expandedQuestion === q.id;
            const score = scores[q.id] ?? 0;
            return (
              <div
                key={q.id}
                className="overflow-hidden rounded-lg border border-slate-200"
              >
                {/* Card header / accordion toggle */}
                <div className="flex items-start gap-2 bg-white px-4 py-3">
                  <button
                    onClick={() => toggleExpanded(q.id)}
                    className="flex flex-1 items-start gap-3 text-left"
                    aria-expanded={isExpanded}
                  >
                    <span className="mt-0.5 text-slate-400">
                      {isExpanded ? (
                        <ChevronUp size={18} />
                      ) : (
                        <ChevronDown size={18} />
                      )}
                    </span>
                    <span className="text-sm font-medium text-slate-800">
                      {q.question}
                    </span>
                  </button>

                  <button
                    onClick={() => handleCopy(q)}
                    title="Copy question"
                    className="no-print shrink-0 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  >
                    {copiedId === q.id ? (
                      <Check size={16} className="text-green-600" />
                    ) : (
                      <Copy size={16} />
                    )}
                  </button>
                </div>

                {/* Expanded body */}
                {isExpanded && (
                  <div className="space-y-4 border-t border-slate-100 bg-slate-50 px-4 py-4">
                    <div className="flex gap-2 rounded-md bg-green-50 p-3 text-sm text-green-900">
                      <CheckCircle2
                        size={18}
                        className="mt-0.5 shrink-0 text-green-600"
                      />
                      <div>
                        <p className="font-semibold">What to look for</p>
                        <p className="mt-0.5 text-green-800">{q.lookFor}</p>
                      </div>
                    </div>

                    <div className="flex gap-2 rounded-md bg-red-50 p-3 text-sm text-red-900">
                      <AlertTriangle
                        size={18}
                        className="mt-0.5 shrink-0 text-red-600"
                      />
                      <div>
                        <p className="font-semibold">Red flags</p>
                        <p className="mt-0.5 text-red-800">{q.redFlags}</p>
                      </div>
                    </div>

                    {/* Star scoring */}
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Score
                      </p>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <button
                            key={value}
                            onClick={() =>
                              setScores((prev) => ({
                                ...prev,
                                [q.id]: prev[q.id] === value ? 0 : value,
                              }))
                            }
                            title={`${value} / 5`}
                            className="rounded p-0.5 transition-transform hover:scale-110"
                          >
                            <Star
                              size={22}
                              className={
                                value <= score
                                  ? "fill-amber-400 text-amber-400"
                                  : "text-slate-300"
                              }
                            />
                          </button>
                        ))}
                        {score > 0 && (
                          <span className="ml-2 text-sm font-medium text-slate-600">
                            {score} / 5
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <label
                        htmlFor={`notes-${q.id}`}
                        className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500"
                      >
                        Recruiter notes
                      </label>
                      <textarea
                        id={`notes-${q.id}`}
                        value={notes[q.id] ?? ""}
                        onChange={(e) =>
                          setNotes((prev) => ({ ...prev, [q.id]: e.target.value }))
                        }
                        rows={3}
                        placeholder="Capture the candidate's answer and your assessment…"
                        className="w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
