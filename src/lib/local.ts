// Per-browser conveniences: the legal acknowledgement, the AI preference and saved reports.
// Every access is guarded because storage can be blocked (private windows, previews).
import type { CheckReport } from "./api";

const ACK = "sl.ack.v1";
const REPORTS = "sl.reports.v1";
const AI = "sw.ai.v1";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable; the app still works for this session */
  }
}

export const hasAcknowledged = () => read<string | null>(ACK, null) !== null;
export const acknowledge = () => write(ACK, new Date().toISOString());

export const aiPreferred = () => read<boolean>(AI, true);
export const preferAi = (on: boolean) => write(AI, on);

export const savedReports = () => read<CheckReport[]>(REPORTS, []);

export function saveReport(r: CheckReport) {
  const rest = savedReports().filter((x) => x.id !== r.id);
  write(REPORTS, [r, ...rest].slice(0, 30));
}

export function deleteReport(id: string) {
  write(REPORTS, savedReports().filter((x) => x.id !== id));
}

export const getReport = (id: string) => savedReports().find((r) => r.id === id) ?? null;
