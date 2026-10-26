// Builds the prior-art packet as a Word document in the browser, from a report the client already holds.
// Same sections as the server's Markdown packet (app/report.py), laid out for an attorney or IP clinic.
import {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, HeadingLevel, Packer, Paragraph, ShadingType, Table, TableCell,
  TableRow, TextRun, WidthType,
} from "docx";
import type { CheckReport, Citation, PatentSummary } from "./api";

const INK = "1C2533";
const MUTED = "4A5566";
const STAMP = "2B3BB8";
const LEVEL_COLOR = { green: "2F7A4D", yellow: "A86E12", red: "B3372B" } as const;
const STATUS = { in_force: "In force", expired: "Expired", lapsed: "Lapsed" } as const;

const pct = (v: number) => `${Math.round(v * 100)}%`;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function link(text: string, url: string) {
  if (!url) return new TextRun({ text });
  return new ExternalHyperlink({ link: url, children: [new TextRun({ text, style: "Hyperlink" })] });
}

function patentLink(p: Pick<PatentSummary, "id" | "url" | "mock">) {
  return p.mock ? new TextRun({ text: `${p.id} (mock)` }) : link(p.id, p.url);
}

function cites(cs: Citation[]) {
  return cs.flatMap((c) => [new TextRun(" ["), link(`${c.patent_id}, ${c.field}`, c.url), new TextRun("]")]);
}

const h = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 320, after: 120 }, children: [new TextRun(text)] });
const p = (children: (TextRun | ExternalHyperlink)[], opts: { after?: number; bullet?: boolean } = {}) =>
  new Paragraph({ children, spacing: { after: opts.after ?? 120 }, bullet: opts.bullet ? { level: 0 } : undefined });

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "C9CDD2" };
function table(header: string[], rows: (TextRun | ExternalHyperlink)[][][], widths: number[]) {
  const cell = (children: (TextRun | ExternalHyperlink)[], i: number, head = false) =>
    new TableCell({
      width: { size: widths[i], type: WidthType.PERCENTAGE },
      shading: head ? { type: ShadingType.CLEAR, fill: "EEF0F2", color: "auto" } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ children })],
    });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER, insideHorizontal: BORDER, insideVertical: BORDER },
    rows: [
      new TableRow({ tableHeader: true, children: header.map((t, i) => cell([new TextRun({ text: t, bold: true })], i, true)) }),
      ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, i)) })),
    ],
  });
}

function notice(title: string, body: string, color: string) {
  return new Paragraph({
    shading: { type: ShadingType.CLEAR, fill: "F4F5F2", color: "auto" },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color, space: 8 } },
    spacing: { before: 120, after: 200 },
    children: [new TextRun({ text: title + " ", bold: true }), new TextRun(body)],
  });
}

export function buildPacket(r: CheckReport): Document {
  const created = new Date(r.created_at).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
  const ra = r.riskiest_assumption;
  const body = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 80 },
      children: [new TextRun({ text: "Prior-art packet", color: INK })],
    }),
    p([new TextRun({ text: `Second Wind report ${r.id}, generated ${created}`, color: MUTED })], { after: 200 }),
    notice("First-pass research, not legal advice.", r.disclaimer, STAMP),
    ...(r.data_mode === "mock" ? [notice("Demo data.", r.data_note, LEVEL_COLOR.yellow)] : []),

    h("The idea"),
    p([new TextRun({ text: r.idea, italics: true })]),
    ...(r.understanding.source === "llm"
      ? [p([new TextRun({ text: "Read as: ", bold: true }), new TextRun(r.understanding.summary)])]
      : []),
    ...(r.understanding.features.length
      ? [p([new TextRun({ text: "Core features: ", bold: true }), new TextRun(r.understanding.features.join("; "))])]
      : []),

    h("Result"),
    p([
      new TextRun({ text: `Overall: ${r.triage.toUpperCase()}`, bold: true, color: LEVEL_COLOR[r.triage] }),
      new TextRun(`   Novelty: ${cap(r.novelty_level)}   Blocking risk: ${cap(r.blocking_level)}`),
    ]),
    p([new TextRun(r.summary)]),

    h("Findings"),
    ...r.claims.map((c) => p([new TextRun(c.text), ...cites(c.citations)], { bullet: true, after: 60 })),

    h("Possible blocking patents"),
    ...(r.blockers.length
      ? [
          table(
            ["Patent", "Title", "In force until", "Level", "Claim overlap"],
            r.blockers.map((b) => [
              [patentLink(b.patent)],
              [new TextRun(b.patent.title)],
              [new TextRun(b.patent.expiry_date)],
              [new TextRun({ text: cap(b.level), bold: true, color: LEVEL_COLOR[b.level] })],
              [new TextRun(pct(b.claim_coverage))],
            ]),
            [18, 40, 16, 12, 14],
          ),
          p([new TextRun({ text: "Claim elements the idea does not mention, by patent:", color: MUTED })], { after: 60 }),
          ...r.blockers.map((b) =>
            p([patentLink(b.patent), new TextRun(`: ${b.unmatched_distinctive_terms.join(", ") || "none identified"}`)], { bullet: true, after: 40 }),
          ),
        ]
      : [p([new TextRun("No in-force patent in the indexed corpus crossed the overlap threshold.")])]),

    h("Closest prior art"),
    ...(r.prior_art.length
      ? [
          table(
            ["Patent", "Title", "Status", "Claim overlap", "Shared terms"],
            r.prior_art.map((a) => [
              [patentLink(a.patent)],
              [new TextRun(a.patent.title)],
              [new TextRun(STATUS[a.patent.status])],
              [new TextRun(pct(a.claim_coverage))],
              [new TextRun(a.matched_terms.join(", "))],
            ]),
            [18, 36, 12, 12, 22],
          ),
        ]
      : [p([new TextRun("No patent in the indexed corpus overlaps meaningfully.")])]),

    h("Riskiest assumption"),
    p([new TextRun({ text: ra.assumption, bold: true })]),
    p([new TextRun({ text: "Two-week test: ", bold: true }), new TextRun(ra.two_week_test), ...cites(ra.citations)]),

    h("Attorney handoff"),
    p([new TextRun({ text: r.attorney_handoff ? "Recommended. " : "Not triggered. ", bold: true }), new TextRun(r.attorney_handoff_reason)]),
    p([new TextRun("Where to find help:")], { after: 60 }),
    p([link("USPTO roster of registered practitioners", "https://oedci.uspto.gov/OEDCI/")], { bullet: true, after: 40 }),
    p([link("USPTO Patent Pro Bono Program", "https://www.uspto.gov/patents/basics/using-legal-services/pro-bono/patent-pro-bono-program")], { bullet: true, after: 40 }),
    p(
      [link("USPTO law school clinic program", "https://www.uspto.gov/learning-and-resources/ip-policy/public-information-about-practitioners/law-school-clinic-1")],
      { bullet: true, after: 200 },
    ),

    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 240 },
      children: [
        new TextRun({
          text:
            "Searched corpus: the patents indexed by Second Wind only (live data: Google Patents Public Data, CC BY 4.0). " +
            "Overlap compares words, not the legal scope of claims. Legal status is estimated from the 20-year term; maintenance fees were not checked.",
          size: 18,
          color: MUTED,
        }),
      ],
    }),
  ];

  return new Document({
    creator: "Second Wind",
    title: `Prior-art packet ${r.id}`,
    description: "Automated first-pass patent research. Not legal advice.",
    styles: {
      default: { document: { run: { font: "Calibri", size: 22, color: INK } } },
      paragraphStyles: [
        { id: "Title", name: "Title", basedOn: "Normal", run: { font: "Georgia", size: 44, bold: true, color: INK } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", run: { font: "Georgia", size: 28, bold: true, color: INK } },
      ],
    },
    sections: [{ properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } }, children: body }],
  });
}

export async function downloadPacket(r: CheckReport) {
  const blob = await Packer.toBlob(buildPacket(r));
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `second-wind-prior-art-${r.id}.docx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
