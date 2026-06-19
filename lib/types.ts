// Shared shapes for the analysis payload returned by /api/analyze.
// These mirror the JSON schema the Claude API is constrained to produce.

export interface ScorecardQuestion {
  id: string;
  question: string;
  lookFor: string;
  redFlags: string;
}

export interface ScorecardTier {
  title: string;
  description: string;
  questions: ScorecardQuestion[];
}

export interface ScorecardData {
  tier1: ScorecardTier;
  tier2: ScorecardTier;
  tier3: ScorecardTier;
}

export interface DeskManual {
  blueprintMarkdown: string;
  scorecardData: ScorecardData;
}

export type TierKey = "tier1" | "tier2" | "tier3";
