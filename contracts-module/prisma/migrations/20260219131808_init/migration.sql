-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'PENDING_SIGNATURES', 'PARTIALLY_SIGNED', 'SIGNED', 'CANCELLED', 'DISPUTED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "PartyRole" AS ENUM ('EMPLOYER', 'CONTRACTOR');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('OFFLINE', 'ESCROW');

-- CreateEnum
CREATE TYPE "SignatureMethod" AS ENUM ('SES_OTP');

-- CreateTable
CREATE TABLE "ctm_contracts" (
    "id" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "jobDescription" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "employerName" TEXT NOT NULL,
    "employerEmail" TEXT NOT NULL,
    "employerAddress" TEXT NOT NULL DEFAULT '',
    "employerIdNumber" TEXT NOT NULL DEFAULT '',
    "contractorId" TEXT NOT NULL,
    "contractorName" TEXT NOT NULL,
    "contractorEmail" TEXT NOT NULL,
    "contractorAddress" TEXT NOT NULL DEFAULT '',
    "contractorIdNumber" TEXT NOT NULL DEFAULT '',
    "price" DECIMAL(65,30) NOT NULL,
    "deadline" TIMESTAMP(3),
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'OFFLINE',
    "employerObligations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contractorObligations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "place" TEXT,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "draftPdfKey" TEXT,
    "draftPdfHash" TEXT,
    "signedPdfKey" TEXT,
    "signedPdfHash" TEXT,
    "finalHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ctm_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ctm_signatures" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partyRole" "PartyRole" NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "signatureMethod" "SignatureMethod" NOT NULL DEFAULT 'SES_OTP',
    "signatureId" TEXT NOT NULL,
    "pdfHashAtSigning" TEXT NOT NULL,

    CONSTRAINT "ctm_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ctm_audit_logs" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ctm_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ctm_otps" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ctm_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ctm_amendments" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "annexNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "pdfKey" TEXT,
    "pdfHash" TEXT,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ctm_amendments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ctm_amendment_signatures" (
    "id" TEXT NOT NULL,
    "amendmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partyRole" "PartyRole" NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "signatureId" TEXT NOT NULL,
    "pdfHashAtSigning" TEXT NOT NULL,

    CONSTRAINT "ctm_amendment_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ctm_contracts_contractNumber_key" ON "ctm_contracts"("contractNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ctm_contracts_offerId_key" ON "ctm_contracts"("offerId");

-- CreateIndex
CREATE INDEX "ctm_contracts_employerId_idx" ON "ctm_contracts"("employerId");

-- CreateIndex
CREATE INDEX "ctm_contracts_contractorId_idx" ON "ctm_contracts"("contractorId");

-- CreateIndex
CREATE INDEX "ctm_contracts_status_idx" ON "ctm_contracts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ctm_signatures_signatureId_key" ON "ctm_signatures"("signatureId");

-- CreateIndex
CREATE INDEX "ctm_signatures_contractId_idx" ON "ctm_signatures"("contractId");

-- CreateIndex
CREATE INDEX "ctm_signatures_userId_idx" ON "ctm_signatures"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ctm_signatures_contractId_partyRole_key" ON "ctm_signatures"("contractId", "partyRole");

-- CreateIndex
CREATE INDEX "ctm_audit_logs_contractId_idx" ON "ctm_audit_logs"("contractId");

-- CreateIndex
CREATE INDEX "ctm_audit_logs_createdAt_idx" ON "ctm_audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "ctm_otps_contractId_userId_idx" ON "ctm_otps"("contractId", "userId");

-- CreateIndex
CREATE INDEX "ctm_amendments_contractId_idx" ON "ctm_amendments"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "ctm_amendments_contractId_annexNumber_key" ON "ctm_amendments"("contractId", "annexNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ctm_amendment_signatures_signatureId_key" ON "ctm_amendment_signatures"("signatureId");

-- CreateIndex
CREATE INDEX "ctm_amendment_signatures_amendmentId_idx" ON "ctm_amendment_signatures"("amendmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ctm_amendment_signatures_amendmentId_partyRole_key" ON "ctm_amendment_signatures"("amendmentId", "partyRole");

-- AddForeignKey
ALTER TABLE "ctm_signatures" ADD CONSTRAINT "ctm_signatures_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ctm_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ctm_audit_logs" ADD CONSTRAINT "ctm_audit_logs_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ctm_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ctm_otps" ADD CONSTRAINT "ctm_otps_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ctm_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ctm_amendments" ADD CONSTRAINT "ctm_amendments_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ctm_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ctm_amendment_signatures" ADD CONSTRAINT "ctm_amendment_signatures_amendmentId_fkey" FOREIGN KEY ("amendmentId") REFERENCES "ctm_amendments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
