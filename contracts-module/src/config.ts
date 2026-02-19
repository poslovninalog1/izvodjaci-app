import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const CONFIG = {
  database: {
    url: required("DATABASE_URL"),
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || "us-east-1",
    bucket: process.env.S3_BUCKET || "contracts",
    accessKey: required("S3_ACCESS_KEY"),
    secretKey: required("S3_SECRET_KEY"),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  },
  otp: {
    expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES || "10", 10),
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS || "5", 10),
    rateLimitPerHour: parseInt(process.env.OTP_RATE_LIMIT_PER_HOUR || "3", 10),
  },
  server: {
    port: parseInt(process.env.PORT || "3001", 10),
    host: process.env.HOST || "0.0.0.0",
  },
  jwt: {
    secret: required("JWT_SECRET"),
  },
  pdf: {
    fontPath: process.env.PDF_FONT_PATH || "",
  },
} as const;
