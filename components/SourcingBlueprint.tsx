"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface SourcingBlueprintProps {
  markdown: string;
}

/**
 * Renders the AI-generated sourcing blueprint markdown with Tailwind Typography
 * styling. Tuned so Boolean code blocks and the objection-handling table read
 * cleanly. GFM is enabled so markdown tables render.
 */
export default function SourcingBlueprint({ markdown }: SourcingBlueprintProps) {
  return (
    <article
      className="prose prose-slate max-w-none
        prose-headings:scroll-mt-20 prose-headings:font-semibold
        prose-h1:text-2xl prose-h2:text-xl prose-h2:mt-8 prose-h2:border-b prose-h2:border-slate-200 prose-h2:pb-2
        prose-h3:text-lg
        prose-a:text-indigo-600
        prose-code:rounded prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-normal prose-code:before:content-[''] prose-code:after:content-['']
        prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-pre:rounded-lg prose-pre:shadow-sm prose-pre:whitespace-pre-wrap prose-pre:break-words
        prose-table:text-sm prose-th:bg-slate-50
        prose-blockquote:border-indigo-300"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </article>
  );
}
