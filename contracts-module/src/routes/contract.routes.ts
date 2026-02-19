import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { ContractService } from "../services/contract.service.js";
import { AuditService } from "../services/audit.service.js";
import { PdfService } from "../services/pdf.service.js";
import { OtpService } from "../services/otp.service.js";
import { StorageService } from "../services/storage.service.js";
import { authMiddleware } from "../middleware/auth.js";
import { AppError } from "../errors.js";
import { prisma } from "../prisma.js";
import type {
  CreateContractInput,
  SignContractInput,
  CreateAmendmentInput,
  OpenDisputeInput,
  CancelInput,
} from "../types.js";

function ip(req: FastifyRequest): string {
  return req.ip || "unknown";
}

function ua(req: FastifyRequest): string {
  return req.headers["user-agent"] || "unknown";
}

export async function contractRoutes(app: FastifyInstance): Promise<void> {
  // Wire up services once per plugin registration
  const storage = new StorageService();
  const auditSvc = new AuditService(prisma);
  const pdfSvc = new PdfService();
  const otpSvc = new OtpService(prisma);
  const svc = new ContractService(prisma, storage, auditSvc, pdfSvc, otpSvc);

  // Shared error handler
  function handleError(err: unknown, reply: FastifyReply): FastifyReply {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({ error: err.message });
    }
    if (err instanceof Error && err.message.startsWith("Invalid status transition")) {
      return reply.status(409).send({ error: err.message });
    }
    console.error("[contracts] unhandled error:", err);
    return reply.status(500).send({ error: "Internal server error" });
  }

  // ── POST /contracts/from-offer/:offerId ─────────────────────────────
  app.post<{
    Params: { offerId: string };
    Body: CreateContractInput;
  }>("/contracts/from-offer/:offerId", async (req, reply) => {
    try {
      const body = { ...req.body, offerId: req.params.offerId };
      const result = await svc.createFromOffer(body, ip(req));
      return reply.status(201).send(result);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // All remaining routes require auth
  app.addHook("onRequest", async (req, reply) => {
    // Skip auth for the internal create endpoint
    if (req.routeOptions?.url === "/contracts/from-offer/:offerId") return;
    await authMiddleware(req, reply);
  });

  // ── GET /contracts/:contractId ──────────────────────────────────────
  app.get<{ Params: { contractId: string } }>(
    "/contracts/:contractId",
    async (req, reply) => {
      try {
        const result = await svc.getContract(req.params.contractId, req.authUser);
        return reply.send(result);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // ── GET /contracts/:contractId/pdf ──────────────────────────────────
  app.get<{ Params: { contractId: string } }>(
    "/contracts/:contractId/pdf",
    async (req, reply) => {
      try {
        const { buffer, filename, contentType } = await svc.downloadPdf(
          req.params.contractId,
          req.authUser,
          ip(req),
        );
        return reply
          .header("Content-Type", contentType)
          .header("Content-Disposition", `attachment; filename="${filename}"`)
          .send(buffer);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // ── POST /contracts/:contractId/otp/request ─────────────────────────
  app.post<{ Params: { contractId: string } }>(
    "/contracts/:contractId/otp/request",
    async (req, reply) => {
      try {
        const result = await svc.requestOtp(
          req.params.contractId,
          req.authUser,
          ip(req),
        );
        return reply.send(result);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // ── POST /contracts/:contractId/sign ────────────────────────────────
  app.post<{
    Params: { contractId: string };
    Body: SignContractInput;
  }>("/contracts/:contractId/sign", async (req, reply) => {
    try {
      const result = await svc.sign(
        req.params.contractId,
        req.authUser,
        req.body.otp,
        ip(req),
        ua(req),
      );
      return reply.send(result);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // ── POST /contracts/:contractId/cancel ──────────────────────────────
  app.post<{
    Params: { contractId: string };
    Body: CancelInput;
  }>("/contracts/:contractId/cancel", async (req, reply) => {
    try {
      const result = await svc.cancel(
        req.params.contractId,
        req.authUser,
        req.body.reason ?? "",
        ip(req),
      );
      return reply.send(result);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // ── POST /contracts/:contractId/dispute/open ────────────────────────
  app.post<{
    Params: { contractId: string };
    Body: OpenDisputeInput;
  }>("/contracts/:contractId/dispute/open", async (req, reply) => {
    try {
      const result = await svc.openDispute(
        req.params.contractId,
        req.authUser,
        req.body.reason,
        ip(req),
      );
      return reply.send(result);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // ── POST /contracts/:contractId/amendments ──────────────────────────
  app.post<{
    Params: { contractId: string };
    Body: CreateAmendmentInput;
  }>("/contracts/:contractId/amendments", async (req, reply) => {
    try {
      const result = await svc.createAmendment(
        req.params.contractId,
        req.authUser,
        req.body.title,
        req.body.content,
        ip(req),
      );
      return reply.status(201).send(result);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // ── GET /contracts/:contractId/audit ────────────────────────────────
  app.get<{ Params: { contractId: string } }>(
    "/contracts/:contractId/audit",
    async (req, reply) => {
      try {
        const logs = await svc.getAuditLog(
          req.params.contractId,
          req.authUser,
        );
        return reply.send(logs);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );
}
