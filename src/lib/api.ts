// Typed client for the Second Life API. Types mirror app/schemas.py.

export type Level = "green" | "yellow" | "red";
export type Status = "in_force" | "lapsed" | "expired";
export type SearchMode = "hybrid" | "bm25" | "embedding" | "cpc";

export interface Citation {
  patent_id: string;
  url: string;
  field: string;
}

export interface PatentSummary {
  id: string;
  title: string;
  abstract: string;
  cpc: string[];
  assignee: string | null;
  filing_date: string;
  grant_date: string;
  status: Status;
  expiry_date: string;
  lapse_date: string | null;
  lapse_reason: string | null;
  fee_data: boolean;
  cited_by_count: number;
  url: string;
  synthetic: boolean;
  mock: boolean;
}

export interface PatentDetail extends PatentSummary {
  claims: string[];
  cites: string[];
  family_ids: string[];
}

export interface Understanding {
  summary: string;
  features: string[];
  search_terms: string[];
  industry: string;
  in_dataset: boolean;
  cpc_hints: string[];
  source: "llm" | "none";
}

export interface PriorArtItem {
  patent: PatentSummary;
  similarity: number;
  claim_coverage: number;
  matched_terms: string[];
  why: string;
}

export interface Blocker {
  patent: PatentSummary;
  claim_coverage: number;
  matched_terms: string[];
  unmatched_distinctive_terms: string[];
  level: Level;
  why: string;
}

export interface CheckReport {
  id: string;
  kind: "check";
  created_at: string;
  idea: string;
  understanding: Understanding;
  data_mode: "live" | "mock";
  data_note: string;
  triage: Level;
  novelty_level: Level;
  blocking_level: Level;
  summary: string;
  claims: { text: string; citations: Citation[] }[];
  prior_art: PriorArtItem[];
  blockers: Blocker[];
  riskiest_assumption: { assumption: string; two_week_test: string; citations: Citation[]; ai_written?: boolean };
  attorney_handoff: boolean;
  attorney_handoff_reason: string;
  metrics: Record<string, number>;
  disclaimer: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  action: "check" | "answer" | "recheck" | "ask";
  reply: string;
  source?: "ai" | "rules";
  report: CheckReport | null;
}

export interface SearchHit {
  patent: PatentSummary;
  score: number;
  components: Record<string, number>;
}

export interface Opportunity {
  rank: number;
  patent: PatentSummary;
  score: number;
  components: Record<string, number>;
  why_ranked: string[];
  why_lapsed: string;
  what_changed: { years_since_lapse: number; newer_patents_in_class: number; possible_blockers: PatentSummary[] };
  citations: Citation[];
}

export interface Stats {
  patents: number;
  by_status: Record<Status, number>;
  as_of: string;
  live_domain?: string;
  live_subclasses?: string[];
}

export interface Health {
  status: string;
  patents: number;
  llm_enabled: boolean;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const BASE = "/api";

async function call<T>(path: string, init?: RequestInit, as: "json" | "text" = "json"): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      ...init,
      headers: init?.body ? { "content-type": "application/json", ...init?.headers } : init?.headers,
    });
  } catch {
    throw new ApiError(0, "Can't reach the research service. Check your connection and try again.");
  }
  if (!res.ok) {
    let detail = `The research service returned an error (${res.status}).`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
      else if (Array.isArray(body.detail) && body.detail[0]?.msg) detail = body.detail[0].msg;
    } catch {
      /* keep the generic message */
    }
    throw new ApiError(res.status, detail);
  }
  return (as === "json" ? res.json() : res.text()) as Promise<T>;
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export const api = {
  health: () => call<Health>("/health"),
  stats: () => call<Stats>("/v1/stats"),
  patents: (q: {
    status?: Status | "";
    cpc?: string;
    expires_after?: string;
    expires_before?: string;
    sort?: "expiry" | "-expiry";
    limit?: number;
    offset?: number;
  }) => {
    const p = new URLSearchParams();
    if (q.status) p.set("status", q.status);
    if (q.cpc) p.set("cpc", q.cpc);
    if (q.expires_after) p.set("expires_after", q.expires_after);
    if (q.expires_before) p.set("expires_before", q.expires_before);
    if (q.sort) p.set("sort", q.sort);
    p.set("limit", String(q.limit ?? 50));
    p.set("offset", String(q.offset ?? 0));
    return call<PatentSummary[]>(`/v1/patents?${p}`);
  },
  patent: (id: string) => call<PatentDetail>(`/v1/patents/${encodeURIComponent(id)}`),
  search: (body: { query: string; k: number; mode: SearchMode; cpc_hints?: string[]; status?: Status[] }) =>
    call<SearchHit[]>("/v1/search", post(body)),
  scout: (body: { cpc_prefixes?: string[]; limit: number; statuses: ("lapsed" | "expired")[] }) =>
    call<Opportunity[]>("/v1/scout", post(body)),
  chat: (messages: ChatMessage[], report: CheckReport | null) =>
    call<ChatResponse>("/v1/chat", post({ messages, report_id: report?.id ?? null, report })),
  packet: (report: CheckReport) => call<string>("/v1/packet", post(report), "text"),
};
