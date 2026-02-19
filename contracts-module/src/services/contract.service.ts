import {
  type PrismaClient,
  ContractStatus,
  PartyRole,
  PaymentMethod,
} from "@prisma/client";
import { assertTransition, SIGNABLE } from "../state-machine.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../errors.js";
import { sha256 } from "../utils/hash.js";
import { generateContractNumber } from "../utils/contract-number.js";
import { AuditService, AuditAction } from "./audit.service.js";
import { PdfService } from "./pdf.service.js";
import { OtpService } from "./otp.service.js";
import { StorageService } from "./storage.service.js";
import type { CreateContractInput, AuthUser } from "../types.js";

export class ContractService {
  constructor(
    private prisma: PrismaClient,
    private storage: StorageService,
    private audit: AuditService,
    private pdf: PdfService,
    private otp: OtpService,
  ) {}

  // ─── Create ────────────────────────────────────────────────────────

  async createFromOffer(
    input: CreateContractInput,
    ip?: string,
  ) {
    const existing = await this.prisma.contract.findUnique({
      where: { offerId: input.offerId },
    });
    if (existing) throw new ConflictError("Contract already exists for this offer.");

    if (input.price == null || input.price <= 0) {
      throw new ValidationError("offer.price must be a positive number.");
    }

    const contractNumber = await generateContractNumber(this.prisma);

    const contract = await this.prisma.contract.create({
      data: {
        contractNumber,
        offerId: input.offerId,
        jobId: input.jobId,
        jobTitle: input.jobTitle,
        jobDescription: input.jobDescription,
        employerId: input.employerId,
        employerName: input.employerName,
        employerEmail: input.employerEmail,
        employerAddress: input.employerAddress ?? "",
        employerIdNumber: input.employerIdNumber ?? "",
        contractorId: input.contractorId,
        contractorName: input.contractorName,
        contractorEmail: input.contractorEmail,
        contractorAddress: input.contractorAddress ?? "",
        contractorIdNumber: input.contractorIdNumber ?? "",
        price: input.price,
        deadline: input.deadline ? new Date(input.deadline) : null,
        paymentMethod:
          input.paymentMethod === "ESCROW"
            ? PaymentMethod.ESCROW
            : PaymentMethod.OFFLINE,
        employerObligations: input.employerObligations ?? [],
        contractorObligations: input.contractorObligations ?? [],
        place: input.place ?? null,
        status: ContractStatus.DRAFT,
        // Sign-or-expire in 7 days
        expiresAt: new Date(Date.now() + 7 * 24 * 3_600_000),
      },
    });

    // Generate draft PDF, hash it, upload
    const pdfBuf = await this.pdf.generateDraft(contract);
    const pdfHash = sha256(pdfBuf);
    const pdfKey = `contracts/${contract.id}/draft-v1.pdf`;
    await this.storage.upload(pdfKey, pdfBuf, "application/pdf");

    const updated = await this.prisma.contract.update({
      where: { id: contract.id },
      data: {
        draftPdfKey: pdfKey,
        draftPdfHash: pdfHash,
        status: ContractStatus.PENDING_SIGNATURES,
      },
    });

    await this.audit.log(contract.id, AuditAction.CREATED, null, { offerId: input.offerId }, ip);
    await this.audit.log(contract.id, AuditAction.PDF_GENERATED, null, { key: pdfKey, hash: pdfHash }, ip);
    await this.audit.log(contract.id, AuditAction.STATUS_CHANGED, null, { from: "DRAFT", to: "PENDING_SIGNATURES" }, ip);

    return updated;
  }

  // ─── Read ──────────────────────────────────────────────────────────

  async getContract(contractId: string, user: AuthUser) {
    const c = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { signatures: true, amendments: { include: { signatures: true } } },
    });
    if (!c) throw new NotFoundError("Contract not found.");
    this.assertParty(c, user);
    return c;
  }

  async downloadPdf(contractId: string, user: AuthUser, ip?: string) {
    const c = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!c) throw new NotFoundError("Contract not found.");
    this.assertParty(c, user);

    const key = c.signedPdfKey ?? c.draftPdfKey;
    if (!key) throw new NotFoundError("No PDF available.");

    const buf = await this.storage.download(key);

    await this.audit.log(contractId, AuditAction.PDF_DOWNLOADED, user.id, { key }, ip);

    const filename = c.signedPdfKey
      ? `${c.contractNumber}-signed.pdf`
      : `${c.contractNumber}-draft.pdf`;

    return { buffer: buf, filename, contentType: "application/pdf" };
  }

  // ─── OTP ───────────────────────────────────────────────────────────

  async requestOtp(contractId: string, user: AuthUser, ip?: string) {
    const c = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { signatures: true },
    });
    if (!c) throw new NotFoundError("Contract not found.");
    this.assertParty(c, user);

    if (!SIGNABLE.has(c.status)) {
      throw new ConflictError(`Cannot sign a contract in status: ${c.status}`);
    }

    const role = this.resolveRole(c, user);
    const alreadySigned = c.signatures.some((s) => s.partyRole === role);
    if (alreadySigned) throw new ConflictError("You have already signed this contract.");

    const result = await this.otp.request(contractId, user.id, user.email, c.contractNumber, ip);

    await this.audit.log(contractId, AuditAction.OTP_REQUESTED, user.id, { role }, ip);

    return result;
  }

  // ─── Sign ──────────────────────────────────────────────────────────

  async sign(
    contractId: string,
    user: AuthUser,
    otpCode: string,
    ip: string,
    userAgent: string,
  ) {
    const c = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { signatures: true },
    });
    if (!c) throw new NotFoundError("Contract not found.");
    this.assertParty(c, user);

    if (!SIGNABLE.has(c.status)) {
      throw new ConflictError(`Cannot sign a contract in status: ${c.status}`);
    }

    const role = this.resolveRole(c, user);
    if (c.signatures.some((s) => s.partyRole === role)) {
      throw new ConflictError("You have already signed this contract.");
    }

    // Verify OTP
    await this.otp.verify(contractId, user.id, otpCode);
    await this.audit.log(contractId, AuditAction.OTP_VERIFIED, user.id, { role }, ip);

    // Get current PDF hash to stamp signature
    const currentHash = c.draftPdfHash!;

    // Create signature record
    const sig = await this.prisma.contractSignature.create({
      data: {
        contractId,
        userId: user.id,
        partyRole: role,
        ipAddress: ip,
        userAgent,
        pdfHashAtSigning: currentHash,
      },
    });

    await this.audit.log(contractId, AuditAction.SIGNED, user.id, {
      role,
      signatureId: sig.signatureId,
    }, ip);

    // Determine new status
    const totalSigs = c.signatures.length + 1;
    let newStatus: ContractStatus;

    if (totalSigs >= 2) {
      newStatus = ContractStatus.SIGNED;
    } else {
      newStatus = ContractStatus.PARTIALLY_SIGNED;
    }

    assertTransition(c.status, newStatus);

    const updateData: Record<string, unknown> = { status: newStatus };

    // If fully signed, generate the final PDF and store its hash
    if (newStatus === ContractStatus.SIGNED) {
      const allSigs = [...c.signatures, sig];
      const signedBuf = await this.pdf.generateSigned(c, allSigs);
      const signedHash = sha256(signedBuf);
      const signedKey = `contracts/${contractId}/signed-v${c.version}.pdf`;

      await this.storage.upload(signedKey, signedBuf, "application/pdf");

      updateData.signedPdfKey = signedKey;
      updateData.signedPdfHash = signedHash;
      updateData.finalHash = signedHash;

      await this.audit.log(contractId, AuditAction.FINALIZED, user.id, {
        key: signedKey,
        hash: signedHash,
      }, ip);
    }

    await this.audit.log(contractId, AuditAction.STATUS_CHANGED, user.id, {
      from: c.status,
      to: newStatus,
    }, ip);

    const updated = await this.prisma.contract.update({
      where: { id: contractId },
      data: updateData as never,
      include: { signatures: true },
    });

    return updated;
  }

  // ─── Cancel ────────────────────────────────────────────────────────

  async cancel(contractId: string, user: AuthUser, reason: string, ip?: string) {
    const c = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!c) throw new NotFoundError("Contract not found.");
    this.assertParty(c, user);

    assertTransition(c.status, ContractStatus.CANCELLED);

    const updated = await this.prisma.contract.update({
      where: { id: contractId },
      data: { status: ContractStatus.CANCELLED },
    });

    await this.audit.log(contractId, AuditAction.CANCELLED, user.id, { reason }, ip);
    await this.audit.log(contractId, AuditAction.STATUS_CHANGED, user.id, {
      from: c.status,
      to: "CANCELLED",
    }, ip);

    return updated;
  }

  // ─── Dispute ───────────────────────────────────────────────────────

  async openDispute(contractId: string, user: AuthUser, reason: string, ip?: string) {
    if (!reason.trim()) throw new ValidationError("Dispute reason is required.");

    const c = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!c) throw new NotFoundError("Contract not found.");
    this.assertParty(c, user);

    assertTransition(c.status, ContractStatus.DISPUTED);

    const updated = await this.prisma.contract.update({
      where: { id: contractId },
      data: { status: ContractStatus.DISPUTED },
    });

    await this.audit.log(contractId, AuditAction.DISPUTE_OPENED, user.id, { reason }, ip);
    await this.audit.log(contractId, AuditAction.STATUS_CHANGED, user.id, {
      from: c.status,
      to: "DISPUTED",
    }, ip);

    return updated;
  }

  // ─── Amendments ────────────────────────────────────────────────────

  async createAmendment(
    contractId: string,
    user: AuthUser,
    title: string,
    content: string,
    ip?: string,
  ) {
    const c = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { amendments: true },
    });
    if (!c) throw new NotFoundError("Contract not found.");
    this.assertParty(c, user);

    if (c.status !== ContractStatus.SIGNED) {
      throw new ConflictError("Amendments can only be created for signed contracts.");
    }

    const nextAnnex = c.amendments.length + 1;

    const amendment = await this.prisma.contractAmendment.create({
      data: {
        contractId,
        annexNumber: nextAnnex,
        title,
        content,
        status: ContractStatus.PENDING_SIGNATURES,
      },
    });

    await this.audit.log(contractId, AuditAction.AMENDMENT_CREATED, user.id, {
      amendmentId: amendment.id,
      annexNumber: nextAnnex,
    }, ip);

    return amendment;
  }

  // ─── Audit ─────────────────────────────────────────────────────────

  async getAuditLog(contractId: string, user: AuthUser) {
    const c = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!c) throw new NotFoundError("Contract not found.");
    this.assertParty(c, user);

    return this.prisma.contractAuditLog.findMany({
      where: { contractId },
      orderBy: { createdAt: "asc" },
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  private assertParty(
    contract: { employerId: string; contractorId: string },
    user: AuthUser,
  ): void {
    if (
      contract.employerId !== user.id &&
      contract.contractorId !== user.id
    ) {
      throw new ForbiddenError("You are not a party to this contract.");
    }
  }

  private resolveRole(
    contract: { employerId: string; contractorId: string },
    user: AuthUser,
  ): PartyRole {
    if (contract.employerId === user.id) return PartyRole.EMPLOYER;
    if (contract.contractorId === user.id) return PartyRole.CONTRACTOR;
    throw new ForbiddenError("You are not a party to this contract.");
  }
}
