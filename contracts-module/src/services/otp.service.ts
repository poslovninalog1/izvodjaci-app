import type { PrismaClient } from "@prisma/client";
import { CONFIG } from "../config.js";
import { generateOtpCode, hashOtp, generateSalt } from "../utils/hash.js";
import { TooManyRequestsError, ValidationError } from "../errors.js";

export interface OtpResult {
  code: string;
  expiresAt: Date;
}

/** Mock email sender — replace with SES / Resend / SMTP in production */
export async function sendOtpEmail(
  to: string,
  code: string,
  contractNumber: string,
): Promise<void> {
  console.log(
    `[EMAIL] To: ${to} | OTP: ${code} | Contract: ${contractNumber}`,
  );
}

export class OtpService {
  constructor(private prisma: PrismaClient) {}

  /** Generate an OTP, store the salted hash, send via email, return expiry. */
  async request(
    contractId: string,
    userId: string,
    email: string,
    contractNumber: string,
    ip?: string,
  ): Promise<{ expiresAt: Date }> {
    await this.enforceRateLimit(contractId, userId);

    const code = generateOtpCode();
    const salt = generateSalt();
    const otpHashValue = hashOtp(code, salt);
    const expiresAt = new Date(Date.now() + CONFIG.otp.expiryMinutes * 60_000);

    await this.prisma.contractOtp.create({
      data: {
        contractId,
        userId,
        otpHash: otpHashValue,
        salt,
        expiresAt,
      },
    });

    await sendOtpEmail(email, code, contractNumber);

    return { expiresAt };
  }

  /**
   * Verify an OTP.  Marks it as used on success.
   * Throws on expiry, wrong code, or too many attempts.
   */
  async verify(
    contractId: string,
    userId: string,
    code: string,
  ): Promise<void> {
    // Find the most recent unused, non-expired OTP for this user+contract
    const otp = await this.prisma.contractOtp.findFirst({
      where: {
        contractId,
        userId,
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otp) {
      throw new ValidationError("No valid OTP found. Request a new one.");
    }

    if (otp.attempts >= CONFIG.otp.maxAttempts) {
      await this.prisma.contractOtp.update({
        where: { id: otp.id },
        data: { used: true },
      });
      throw new TooManyRequestsError(
        "Too many failed attempts. Request a new OTP.",
      );
    }

    const hashed = hashOtp(code, otp.salt);

    if (hashed !== otp.otpHash) {
      await this.prisma.contractOtp.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new ValidationError(
        `Invalid OTP. ${CONFIG.otp.maxAttempts - otp.attempts - 1} attempts remaining.`,
      );
    }

    await this.prisma.contractOtp.update({
      where: { id: otp.id },
      data: { used: true },
    });
  }

  /** Enforce per-hour rate limit on OTP requests */
  private async enforceRateLimit(
    contractId: string,
    userId: string,
  ): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 3_600_000);
    const recentCount = await this.prisma.contractOtp.count({
      where: {
        contractId,
        userId,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (recentCount >= CONFIG.otp.rateLimitPerHour) {
      throw new TooManyRequestsError(
        `OTP rate limit exceeded. Max ${CONFIG.otp.rateLimitPerHour} per hour.`,
      );
    }
  }
}
