import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ReportView } from "../components/ReportView";
import { useService } from "../components/AppShell";
import { ErrorNote } from "../components/ui";
import { api, type ChatMessage, type CheckReport } from "../lib/api";
import { getReport, saveReport } from "../lib/local";

const EXAMPLES = [
  {
    key: "coldbrew",
    name: "Ultrasonic cold brew",
    text: "A cold brew coffee system with an ultrasonic transducer exciting the grounds slurry in chilled water to cut brew time from hours to minutes",
  },
  {
    key: "pod",
    name: "Barcode-reading pod brewer",
    text: "A single-serve brewer that reads a barcode on each pod to set water temperature and volume automatically",
  },
  {
    key: "bottle",
    name: "Smart water bottle (demo data)",
    text: "A smart water bottle with a level sensor that tracks how much you drink and reminds you through a phone app",
  },
];

type Msg = ChatMessage & { source?: "ai" | "rules" };

const GREETING: Msg = {
  role: "assistant",
  content:
    "Describe your product in a sentence or two: what it does and how it works. I'll search the patent corpus and rate how much it overlaps with existing patents. After that, ask me about any result, or tell me how you'd change the design and I'll re-check.",
};

export function CheckPage() {
  const [params, setParams] = useSearchParams();
  const { ai } = useService();
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [report, setReport] = useState<CheckReport | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastSent, setLastSent] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rid = params.get("report");
    if (rid) {
      const r = getReport(rid);
      if (r) {
        setReport(r);
        setMessages([GREETING, { role: "user", content: r.idea }, { role: "assistant", content: `Reopened report ${r.id}. Ask about any result or describe a design change.` }]);
      }
    }
    const ex = EXAMPLES.find((e) => e.key === params.get("example"));
    if (ex) setDraft(ex.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, busy]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setDraft("");
    setBusy(true);
    setError("");
    setLastSent(content);
    try {
      // The greeting is UI copy, not part of the conversation the API sees.
      const res = await api.chat(next.slice(1).slice(-30).map(({ role, content }) => ({ role, content })), report, ai);
      setMessages([...next, { role: "assistant", content: res.reply, source: res.action === "answer" ? res.source ?? "rules" : undefined }]);
      if (res.report) {
        setReport(res.report);
        saveReport(res.report);
        setParams({ report: res.report.id }, { replace: true });
      }
    } catch (e) {
      setMessages(messages);
      setDraft(content);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setMessages([GREETING]);
    setReport(null);
    setError("");
    setParams({}, { replace: true });
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Idea check</h1>
          <p>
            Check a product idea for novelty and blocking patents. A check usually takes under a minute; ideas in a new industry can take longer
            the first time while demo data is prepared.
          </p>
        </div>
        {report && (
          <button className="btn ghost" onClick={reset}>
            Start a new check
          </button>
        )}
      </div>

      <div className="check">
        <section className="panel convo" aria-label="Conversation">
          <div className="msgs" aria-live="polite">
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                {m.content}
                {m.source && (
                  <span className="msg-source">
                    {m.source === "ai" ? "AI answer, checked against this report's patents, numbers and dates" : "Answer taken directly from the report"}
                  </span>
                )}
              </div>
            ))}
            {busy && (
              <div className="msg assistant pending">
                <span className="spinner" /> {report ? "Working on it…" : "Reading your idea and searching the corpus…"}
              </div>
            )}
            <div ref={endRef} />
          </div>
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            {error && <ErrorNote error={error} onRetry={lastSent ? () => send(lastSent) : undefined} />}
            <label className="visually-hidden" htmlFor="idea">
              {report ? "Ask a follow-up or describe a design change" : "Describe your idea"}
            </label>
            <textarea
              id="idea"
              className="textarea"
              value={draft}
              maxLength={4000}
              placeholder={report ? "Why was the first patent flagged?  Or: what if I used a paddle instead of ultrasound?" : "A cold brew maker that…"}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                }
              }}
            />
            <div className="row">
              <span className="faint small">
                {!ai ? "AI is off: follow-ups longer than a sentence re-check the design." : "Enter to send, Shift+Enter for a new line"}
              </span>
              <button className="btn sm" disabled={busy || draft.trim().length === 0}>
                {report ? "Send" : "Check idea"}
              </button>
            </div>
          </form>
        </section>

        <div>
          {report ? (
            <ReportView report={report} />
          ) : (
            <div className="panel empty">
              <h2>Your report will appear here</h2>
              <p>
                The live corpus is US coffee and beverage-making patents, so ideas in that space get real results. Anything else runs on labeled
                demo data. Start from an example:
              </p>
              <div className="examples" style={{ marginTop: 20, maxWidth: 560 }}>
                {EXAMPLES.map((e) => (
                  <button key={e.key} onClick={() => send(e.text)} disabled={busy}>
                    <b>{e.name}</b>
                    {e.text}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
