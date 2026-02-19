import type { FastifyRequest, FastifyReply } from "fastify";
import { createHmac } from "node:crypto";
import { CONFIG } from "../config.js";
import type { AuthUser } from "../types.js";

/**
 * Lightweight JWT-ish auth middleware.
 *
 * In production, replace the verify logic with your real JWT library
 * (e.g., jose, jsonwebtoken) or validate against Supabase's JWT.
 * The important part is that `request.authUser` is populated.
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Missing or invalid Authorization header." });
  }

  const token = header.slice(7);
  try {
    const user = verifyToken(token);
    request.authUser = user;
  } catch {
    return reply.status(401).send({ error: "Invalid or expired token." });
  }
}

// ── Minimal HMAC-based token for development ──────────────────────────
// Token format: base64url(json-payload).signature
// Replace with proper JWT verification in production.

function verifyToken(token: string): AuthUser {
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) throw new Error("Malformed token");

  const expectedSig = createHmac("sha256", CONFIG.jwt.secret)
    .update(payloadB64)
    .digest("base64url");

  if (sig !== expectedSig) throw new Error("Invalid signature");

  const json = Buffer.from(payloadB64, "base64url").toString("utf-8");
  const payload = JSON.parse(json);

  if (!payload.id || !payload.role || !payload.email) {
    throw new Error("Incomplete token payload");
  }

  return {
    id: payload.id,
    role: payload.role,
    email: payload.email,
    fullName: payload.fullName ?? "",
  };
}

/** Helper to create a token for tests / dev scripts */
export function createDevToken(user: AuthUser): string {
  const payloadB64 = Buffer.from(JSON.stringify(user)).toString("base64url");
  const sig = createHmac("sha256", CONFIG.jwt.secret)
    .update(payloadB64)
    .digest("base64url");
  return `${payloadB64}.${sig}`;
}
