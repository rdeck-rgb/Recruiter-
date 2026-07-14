import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Sourcing Architect — Recruiter Desk Manual",
  description:
    "Paste a raw job description and generate a complete A-Z sourcing playbook: Boolean strings, target companies, outreach sequences, and an interactive 3-tier interview scorecard.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen text-slate-900 antialiased">{children}</body>
    </html>
  );
}
