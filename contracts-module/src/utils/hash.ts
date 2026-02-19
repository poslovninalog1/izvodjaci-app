import { createHash, randomBytes } from "node:crypto";

/** SHA-256 of a buffer, returned as hex string */
export function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Hash an OTP with a random salt */
export function hashOtp(otp: string, salt: string): string {
  return sha256(otp + salt);
}

/** Generate a cryptographically random salt */
export function generateSalt(): string {
  return randomBytes(16).toString("hex");
}

/** Generate a 6-digit numeric OTP */
export function generateOtpCode(): string {
  const bytes = randomBytes(4);
  const num = bytes.readUInt32BE() % 1_000_000;
  return String(num).padStart(6, "0");
}
