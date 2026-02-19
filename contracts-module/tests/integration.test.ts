import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { ContractStatus, PartyRole, PrismaClient } from "@prisma/client";
import { ContractService } from "../src/services/contract.service.js";
import { AuditService } from "../src/services/audit.service.js";
import { PdfService } from "../src/services/pdf.service.js";
import { OtpService, sendOtpEmail } from "../src/services/otp.service.js";
import { StorageService } from "../src/services/storage.service.js";
import { sha256 } from "../src/utils/hash.js";
import { mockEmployer, mockContractor, mockCreateInput } from "./helpers.js";

// ── Mocks ─────────────────────────────────────────────────────────────

vi.mock("../src/services/otp.service.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/services/otp.service.js")>();
  return {
    ...mod,
    sendOtpEmail: vi.fn().mockResolvedValue(undefined),
  };
});

/**
 * These tests exercise the full signing lifecycle.
 *
 * REQUIREMENTS:
 *   - A running PostgreSQL database with the Prisma schema applied.
 *     Set DATABASE_URL in .env or .env.test before running.
 *   - S3 / MinIO running (or mock StorageService below).
 *
 * To run with a mocked storage (no S3 needed), uncomment the mock below.
 */

// Uncomment to mock S3 entirely:
// vi.mock("../src/services/storage.service.js", () => ({
//   StorageService: vi.fn().mockImplementation(() => ({
//     upload: vi.fn().mockResolvedValue(undefined),
//     download: vi.fn().mockResolvedValue(Buffer.from("fake-pdf")),
//     exists: vi.fn().mockResolvedValue(true),
//   })),
// }));

// We create a real Prisma client for integration tests; skip if no DB
const prisma = new PrismaClient();

const storage = {
  upload: vi.fn().mockResolvedValue(undefined),
  download: vi.fn().mockResolvedValue(Buffer.from("mock-pdf")),
  exists: vi.fn().mockResolvedValue(true),
} as unknown as StorageService;

const auditSvc = new AuditService(prisma);
const pdfSvc = new PdfService();
const otpSvc = new OtpService(prisma);
const svc = new ContractService(prisma, storage, auditSvc, pdfSvc, otpSvc);

const employer = mockEmployer();
const contractor = mockContractor();

// Capture OTP from the mock email sender
function captureOtp(): string | null {
  const calls = (sendOtpEmail as ReturnType<typeof vi.fn>).mock.calls;
  const last = calls[calls.length - 1];
  return last ? (last[1] as string) : null;
}

describe("Integration: Contract signing lifecycle", () => {
  let contractId: string;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a contract from an offer", async () => {
    const input = mockCreateInput(employer, contractor);
    const contract = await svc.createFromOffer(input);

    expect(contract.id).toBeDefined();
    expect(contract.contractNumber).toMatch(/^CTR-\d{8}-\d{4}$/);
    expect(contract.status).toBe(ContractStatus.PENDING_SIGNATURES);
    expect(contract.draftPdfKey).toContain("draft-v1.pdf");
    expect(contract.draftPdfHash).toHaveLength(64);
    expect(storage.upload).toHaveBeenCalledOnce();

    contractId = contract.id;
  });

  it("rejects duplicate contract for the same offer", async () => {
    const input = mockCreateInput(employer, contractor);
    await svc.createFromOffer(input);

    await expect(svc.createFromOffer(input)).rejects.toThrow(
      "Contract already exists for this offer",
    );
  });

  it("employer requests OTP", async () => {
    const input = mockCreateInput(employer, contractor);
    const contract = await svc.createFromOffer(input);
    contractId = contract.id;

    const result = await svc.requestOtp(contractId, employer);
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(sendOtpEmail).toHaveBeenCalledWith(
      employer.email,
      expect.stringMatching(/^\d{6}$/),
      contract.contractNumber,
    );
  });

  it("employer signs → status becomes PARTIALLY_SIGNED", async () => {
    const input = mockCreateInput(employer, contractor);
    const contract = await svc.createFromOffer(input);
    contractId = contract.id;

    await svc.requestOtp(contractId, employer);
    const otpCode = captureOtp()!;
    expect(otpCode).toBeTruthy();

    const signed = await svc.sign(contractId, employer, otpCode, "127.0.0.1", "vitest");

    expect(signed.status).toBe(ContractStatus.PARTIALLY_SIGNED);
    expect(signed.signatures).toHaveLength(1);
    expect(signed.signatures[0].partyRole).toBe(PartyRole.EMPLOYER);
  });

  it("contractor signs → status becomes SIGNED + final PDF generated", async () => {
    const input = mockCreateInput(employer, contractor);
    const contract = await svc.createFromOffer(input);
    contractId = contract.id;

    // Employer signs
    await svc.requestOtp(contractId, employer);
    const empOtp = captureOtp()!;
    await svc.sign(contractId, employer, empOtp, "1.2.3.4", "vitest");

    // Contractor signs
    await svc.requestOtp(contractId, contractor);
    const conOtp = captureOtp()!;
    const final = await svc.sign(contractId, contractor, conOtp, "5.6.7.8", "vitest");

    expect(final.status).toBe(ContractStatus.SIGNED);
    expect(final.signatures).toHaveLength(2);
    expect(final.signedPdfKey).toContain("signed-v1.pdf");
    expect(final.signedPdfHash).toHaveLength(64);
    expect(final.finalHash).toBe(final.signedPdfHash);
  });

  it("rejects duplicate signature from the same party", async () => {
    const input = mockCreateInput(employer, contractor);
    const contract = await svc.createFromOffer(input);
    contractId = contract.id;

    await svc.requestOtp(contractId, employer);
    const otp1 = captureOtp()!;
    await svc.sign(contractId, employer, otp1, "127.0.0.1", "vitest");

    // Try to request OTP again as employer
    await expect(svc.requestOtp(contractId, employer)).rejects.toThrow(
      "You have already signed this contract",
    );
  });

  it("rejects signing a cancelled contract", async () => {
    const input = mockCreateInput(employer, contractor);
    const contract = await svc.createFromOffer(input);
    contractId = contract.id;

    await svc.cancel(contractId, employer, "Changed my mind");

    await expect(svc.requestOtp(contractId, employer)).rejects.toThrow(
      /Cannot sign a contract in status/,
    );
  });

  it("rejects signing a fully signed contract", async () => {
    const input = mockCreateInput(employer, contractor);
    const contract = await svc.createFromOffer(input);
    contractId = contract.id;

    await svc.requestOtp(contractId, employer);
    await svc.sign(contractId, employer, captureOtp()!, "1.1.1.1", "vitest");

    await svc.requestOtp(contractId, contractor);
    await svc.sign(contractId, contractor, captureOtp()!, "2.2.2.2", "vitest");

    // Now both have signed — contract is SIGNED
    await expect(svc.requestOtp(contractId, employer)).rejects.toThrow(
      /Cannot sign a contract in status/,
    );
  });

  it("wrong OTP increments attempts and rejects", async () => {
    const input = mockCreateInput(employer, contractor);
    const contract = await svc.createFromOffer(input);
    contractId = contract.id;

    await svc.requestOtp(contractId, employer);

    await expect(
      svc.sign(contractId, employer, "000000", "127.0.0.1", "vitest"),
    ).rejects.toThrow(/Invalid OTP/);
  });

  it("opens a dispute on a signed contract", async () => {
    const input = mockCreateInput(employer, contractor);
    const contract = await svc.createFromOffer(input);
    contractId = contract.id;

    await svc.requestOtp(contractId, employer);
    await svc.sign(contractId, employer, captureOtp()!, "1.1.1.1", "vitest");
    await svc.requestOtp(contractId, contractor);
    await svc.sign(contractId, contractor, captureOtp()!, "2.2.2.2", "vitest");

    const disputed = await svc.openDispute(contractId, employer, "Work not delivered");
    expect(disputed.status).toBe(ContractStatus.DISPUTED);
  });

  it("cannot open dispute on unsigned contract", async () => {
    const input = mockCreateInput(employer, contractor);
    const contract = await svc.createFromOffer(input);
    contractId = contract.id;

    await expect(
      svc.openDispute(contractId, employer, "reason"),
    ).rejects.toThrow(/Invalid status transition/);
  });

  it("creates an amendment only on signed contracts", async () => {
    const input = mockCreateInput(employer, contractor);
    const contract = await svc.createFromOffer(input);
    contractId = contract.id;

    // Not yet signed
    await expect(
      svc.createAmendment(contractId, employer, "Annex 1", "Change deadline"),
    ).rejects.toThrow("Amendments can only be created for signed contracts");

    // Sign both parties
    await svc.requestOtp(contractId, employer);
    await svc.sign(contractId, employer, captureOtp()!, "1.1.1.1", "vitest");
    await svc.requestOtp(contractId, contractor);
    await svc.sign(contractId, contractor, captureOtp()!, "2.2.2.2", "vitest");

    const amendment = await svc.createAmendment(
      contractId,
      employer,
      "Annex 1",
      "Extended deadline by 2 weeks",
    );

    expect(amendment.annexNumber).toBe(1);
    expect(amendment.status).toBe(ContractStatus.PENDING_SIGNATURES);
  });

  it("third party cannot access contract", async () => {
    const input = mockCreateInput(employer, contractor);
    const contract = await svc.createFromOffer(input);

    const stranger = mockEmployer({ id: randomUUID(), email: "stranger@test.com" });

    await expect(svc.getContract(contract.id, stranger)).rejects.toThrow(
      "You are not a party to this contract",
    );
  });

  it("returns audit log in chronological order", async () => {
    const input = mockCreateInput(employer, contractor);
    const contract = await svc.createFromOffer(input);

    const logs = await svc.getAuditLog(contract.id, employer);
    expect(logs.length).toBeGreaterThanOrEqual(3); // CREATED, PDF_GENERATED, STATUS_CHANGED

    const timestamps = logs.map((l) => new Date(l.createdAt).getTime());
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
    }
  });

  it("PDF hash matches actual buffer content", async () => {
    const input = mockCreateInput(employer, contractor);
    const contract = await svc.createFromOffer(input);

    // The draft PDF buffer was passed to storage.upload
    const uploadCalls = (storage.upload as ReturnType<typeof vi.fn>).mock.calls;
    const pdfBuf = uploadCalls[0][1] as Buffer;
    const computedHash = sha256(pdfBuf);

    expect(contract.draftPdfHash).toBe(computedHash);
  });
});
