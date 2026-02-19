import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import type { Contract, ContractSignature } from "@prisma/client";
import { sanitize } from "../utils/sanitize.js";
import { CONFIG } from "../config.js";

interface SignatureBlock {
  partyLabel: string;
  fullName: string;
  email: string;
  timestamp?: string;
  ipAddress?: string;
  signatureId?: string;
  documentHash?: string;
}

export class PdfService {
  private fontName: string;

  constructor() {
    this.fontName = "Helvetica";
  }

  /** Register a custom font on the document if a TTF path is configured */
  private applyFont(doc: PDFKit.PDFDocument): void {
    const path = CONFIG.pdf.fontPath;
    if (path && existsSync(path)) {
      doc.registerFont("CustomFont", path);
      this.fontName = "CustomFont";
    }
    doc.font(this.fontName);
  }

  // ── helpers ──────────────────────────────────────────────────────────

  private heading(doc: PDFKit.PDFDocument, text: string, size = 13): void {
    doc.fontSize(size).font(`${this.fontName}-Bold` !== "Helvetica-Bold" ? this.fontName : "Helvetica-Bold")
      .text(text, { underline: true });
    doc.font(this.fontName);
    doc.moveDown(0.3);
  }

  private body(doc: PDFKit.PDFDocument, text: string): void {
    doc.fontSize(10).text(text);
  }

  private hr(doc: PDFKit.PDFDocument): void {
    const y = doc.y;
    doc.moveTo(60, y).lineTo(535, y).stroke("#cccccc");
    doc.moveDown(0.8);
  }

  private sigBlock(doc: PDFKit.PDFDocument, b: SignatureBlock): void {
    doc.fontSize(10).font(this.fontName);
    doc.text(`${b.partyLabel}:`, { underline: true });
    doc.text(`  Ime i prezime: ${b.fullName}`);
    doc.text(`  Email: ${b.email}`);
    if (b.timestamp) doc.text(`  Datum i vrijeme: ${b.timestamp}`);
    if (b.ipAddress) doc.text(`  IP adresa: ${b.ipAddress}`);
    if (b.signatureId) doc.text(`  ID potpisa: ${b.signatureId}`);
    if (b.documentHash) doc.text(`  Hash dokumenta (SHA-256): ${b.documentHash}`);
    if (b.timestamp) {
      doc.moveDown(0.2);
      doc.fontSize(8).fillColor("#555555")
        .text("Ovaj dokument je elektronski potpisan putem platforme.")
        .fillColor("#000000");
    } else {
      doc.text("  Potpis: _________________");
    }
    doc.fontSize(10).moveDown(0.8);
  }

  // ── public API ───────────────────────────────────────────────────────

  /** Generate the draft PDF (empty signature blocks) */
  async generateDraft(contract: Contract): Promise<Buffer> {
    return this.generate(contract, []);
  }

  /** Generate the final signed PDF with filled-in signature blocks */
  async generateSigned(
    contract: Contract,
    signatures: ContractSignature[],
  ): Promise<Buffer> {
    return this.generate(contract, signatures);
  }

  private generate(
    c: Contract,
    signatures: ContractSignature[],
  ): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 60, bottom: 60, left: 60, right: 60 },
        info: {
          Title: "Ugovor o izvodjenju usluge",
          Author: "Izvodjaci platforma",
        },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      this.applyFont(doc);

      // ── Title ────────────────────────────────────────────
      doc.fontSize(18).text("UGOVOR O IZVODJENJU USLUGE", { align: "center" });
      doc.moveDown(0.4);
      doc.fontSize(11).text(`Broj: ${c.contractNumber}`, { align: "center" });
      doc.moveDown(1.2);
      this.hr(doc);

      // ── Party 1 ─────────────────────────────────────────
      this.heading(doc, "Strana 1 - Narucilac");
      this.body(doc, `Ime i prezime: ${sanitize(c.employerName)}`);
      if (c.employerAddress) this.body(doc, `Adresa: ${sanitize(c.employerAddress)}`);
      if (c.employerIdNumber) this.body(doc, `Identifikacioni broj: ${c.employerIdNumber}`);
      this.body(doc, `Email: ${c.employerEmail}`);
      doc.moveDown(0.8);

      // ── Party 2 ─────────────────────────────────────────
      this.heading(doc, "Strana 2 - Izvodjac");
      this.body(doc, `Ime i prezime: ${sanitize(c.contractorName)}`);
      if (c.contractorAddress) this.body(doc, `Adresa: ${sanitize(c.contractorAddress)}`);
      if (c.contractorIdNumber) this.body(doc, `Identifikacioni broj: ${c.contractorIdNumber}`);
      this.body(doc, `Email: ${c.contractorEmail}`);
      doc.moveDown(0.8);

      // ── Subject ─────────────────────────────────────────
      this.heading(doc, "Predmet ugovora");
      this.body(doc, `Naslov posla: ${sanitize(c.jobTitle)}`);
      doc.moveDown(0.3);
      doc.fontSize(10).text(sanitize(c.jobDescription), { lineGap: 2 });
      doc.moveDown(0.8);

      // ── Price ───────────────────────────────────────────
      this.heading(doc, "Cijena");
      this.body(doc, `${c.price.toString()} EUR`);
      doc.moveDown(0.8);

      // ── Deadline ────────────────────────────────────────
      if (c.deadline) {
        this.heading(doc, "Rok izvrsenja");
        this.body(doc, c.deadline.toISOString().slice(0, 10));
        doc.moveDown(0.8);
      }

      // ── Obligations ─────────────────────────────────────
      if (c.contractorObligations.length > 0) {
        this.heading(doc, "Obaveze izvodjaca");
        for (const o of c.contractorObligations) {
          doc.fontSize(10).text(`  \u2022  ${sanitize(o)}`);
        }
        doc.moveDown(0.8);
      }
      if (c.employerObligations.length > 0) {
        this.heading(doc, "Obaveze narucioca");
        for (const o of c.employerObligations) {
          doc.fontSize(10).text(`  \u2022  ${sanitize(o)}`);
        }
        doc.moveDown(0.8);
      }

      // ── Payment ─────────────────────────────────────────
      this.heading(doc, "Nacin placanja");
      this.body(doc, c.paymentMethod === "ESCROW" ? "Escrow (depozit)" : "Direktno placanje");
      doc.moveDown(0.8);

      // ── Date & place ────────────────────────────────────
      this.heading(doc, "Datum i mjesto");
      const dateStr = new Date().toISOString().slice(0, 10);
      this.body(doc, `Datum: ${dateStr}`);
      if (c.place) this.body(doc, `Mjesto: ${sanitize(c.place)}`);
      doc.moveDown(1.2);

      // ── Signature blocks ────────────────────────────────
      this.hr(doc);
      doc.fontSize(12).text("Digitalni potpisi", { align: "center" });
      doc.moveDown(0.8);

      const empSig = signatures.find((s) => s.partyRole === "EMPLOYER");
      const conSig = signatures.find((s) => s.partyRole === "CONTRACTOR");

      this.sigBlock(doc, {
        partyLabel: "Narucilac",
        fullName: c.employerName,
        email: c.employerEmail,
        timestamp: empSig?.signedAt.toISOString(),
        ipAddress: empSig?.ipAddress,
        signatureId: empSig?.signatureId,
        documentHash: empSig?.pdfHashAtSigning,
      });

      this.sigBlock(doc, {
        partyLabel: "Izvodjac",
        fullName: c.contractorName,
        email: c.contractorEmail,
        timestamp: conSig?.signedAt.toISOString(),
        ipAddress: conSig?.ipAddress,
        signatureId: conSig?.signatureId,
        documentHash: conSig?.pdfHashAtSigning,
      });

      // ── Footer ──────────────────────────────────────────
      doc.moveDown(0.5);
      doc.fontSize(7).fillColor("#999999").text(
        `Generisano: ${new Date().toISOString()} | Verzija: ${c.version}`,
        { align: "center" },
      );

      doc.end();
    });
  }
}
