import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type ContractPdfData = {
  contractId: number;
  clientName: string;
  freelancerName: string;
  jobTitle: string;
  jobDescription: string;
  budgetType: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  startedAt: string;
  acceptedAt: string;
  tosVersion: string;
};

/**
 * Deterministic PDF generation for contract evidence.
 * Uses fixed dates/metadata so the same input always yields the same hash.
 */
export async function generateContractPdf(
  data: ContractPdfData
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Ugovor o izvodjenju usluge");
  doc.setAuthor("Izvodjaci platforma");
  const acceptedAt = data.acceptedAt && String(data.acceptedAt).trim() ? data.acceptedAt : new Date().toISOString();
  const acceptedDate = new Date(acceptedAt);
  if (!Number.isNaN(acceptedDate.getTime())) {
    doc.setCreationDate(acceptedDate);
    doc.setModificationDate(acceptedDate);
  }

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const MARGIN = 50;
  const MAX_W = PAGE_W - 2 * MARGIN;
  const LINE_H = 16;
  const SECTION_GAP = 24;

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  }

  function drawText(
    text: string,
    size: number,
    f: typeof font,
    opts?: { align?: "center" }
  ) {
    ensureSpace(size + 4);
    const w = f.widthOfTextAtSize(text, size);
    const x = opts?.align === "center" ? (PAGE_W - w) / 2 : MARGIN;
    page.drawText(text, { x, y, size, font: f, color: rgb(0, 0, 0) });
    y -= size + 6;
  }

  function drawWrapped(text: string, size: number, f: typeof font) {
    const words = text.split(/\s+/);
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (f.widthOfTextAtSize(test, size) > MAX_W) {
        ensureSpace(LINE_H);
        page.drawText(line, { x: MARGIN, y, size, font: f, color: rgb(0, 0, 0) });
        y -= LINE_H;
        line = word;
      } else {
        line = test;
      }
    }
    if (line) {
      ensureSpace(LINE_H);
      page.drawText(line, { x: MARGIN, y, size, font: f, color: rgb(0, 0, 0) });
      y -= LINE_H;
    }
  }

  function drawLine() {
    ensureSpace(10);
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.5,
      color: rgb(0.75, 0.75, 0.75),
    });
    y -= 12;
  }

  function sectionTitle(text: string) {
    y -= SECTION_GAP / 2;
    drawText(text, 12, fontBold);
    y -= 2;
  }

  function labelValue(label: string, value: string) {
    ensureSpace(LINE_H);
    const labelW = fontBold.widthOfTextAtSize(label, 10);
    page.drawText(label, { x: MARGIN, y, size: 10, font: fontBold, color: rgb(0, 0, 0) });
    page.drawText(value, { x: MARGIN + labelW + 4, y, size: 10, font, color: rgb(0, 0, 0) });
    y -= LINE_H;
  }

  // ── Title ──
  drawText("UGOVOR O IZVODJENJU USLUGE", 18, fontBold, { align: "center" });
  y -= 4;
  drawText(`Broj ugovora: ${data.contractId}`, 11, font, { align: "center" });
  y -= 8;
  drawLine();

  // ── Parties ──
  sectionTitle("Strane ugovora");
  labelValue("Klijent (narucilac): ", stripDiacritics(data.clientName));
  labelValue("Izvodjac: ", stripDiacritics(data.freelancerName));

  // ── Subject ──
  sectionTitle("Predmet ugovora");
  labelValue("Naslov posla: ", stripDiacritics(data.jobTitle));
  y -= 4;
  drawWrapped(stripDiacritics(data.jobDescription || "-"), 10, font);

  // ── Price ──
  sectionTitle("Cijena i uslovi");
  const priceStr = formatBudget(data.budgetType, data.budgetMin, data.budgetMax);
  labelValue("Budzet: ", priceStr);
  labelValue("Tip: ", (data.budgetType ?? "") === "hourly" ? "Po satu" : "Fiksno");

  // ── Dates ──
  sectionTitle("Datumi");
  labelValue("Zapocet: ", formatDate(data.startedAt ?? acceptedAt));
  labelValue("Prihvacen: ", formatDate(acceptedAt));

  // ── Acceptance statement ──
  y -= SECTION_GAP;
  drawLine();
  sectionTitle("Izjava o prihvatanju");
  drawWrapped(
    "Ovaj ugovor je prihvacen elektronskim putem (klikom na dugme " +
    "'Prihvati ugovor') na platformi Izvodjaci. Obje strane potvrdjuju " +
    "da su procitale i razumjele uslove koristenja platforme i ovog ugovora.",
    10,
    font
  );
  y -= 8;
  labelValue("Nacin prihvatanja: ", "Accepted by click");
  labelValue("Verzija uslova koriscenja: ", data.tosVersion ?? "—");

  // ── Footer ──
  y -= SECTION_GAP;
  drawLine();
  ensureSpace(LINE_H);
  const footerText = `Generisano: ${acceptedAt} | ID ugovora: ${data.contractId}`;
  const footerW = font.widthOfTextAtSize(footerText, 7);
  page.drawText(footerText, {
    x: (PAGE_W - footerW) / 2,
    y: MARGIN / 2,
    size: 7,
    font,
    color: rgb(0.6, 0.6, 0.6),
  });

  return doc.save();
}

const DIACRITICS: Record<string, string> = {
  "\u0107": "c", "\u010D": "c", "\u0106": "C", "\u010C": "C",
  "\u0111": "dj", "\u0110": "Dj",
  "\u0161": "s", "\u0160": "S",
  "\u017E": "z", "\u017D": "Z",
};

function stripDiacritics(text: string): string {
  return text.replace(/[\u0106\u0107\u010C\u010D\u0110\u0111\u0160\u0161\u017D\u017E]/g, (ch) => DIACRITICS[ch] ?? ch);
}

function formatBudget(
  type: string | null,
  min: number | null,
  max: number | null
): string {
  if (min != null && max != null) return `${min} - ${max} EUR`;
  if (max != null) return `do ${max} EUR`;
  if (min != null) return `od ${min} EUR`;
  return "-";
}

function formatDate(iso: string | null | undefined): string {
  if (iso == null || String(iso).trim() === "") return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString("sr-Latn", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return String(iso);
  }
}
