import type { Contract, ContractSignature, ContractAmendment } from "@prisma/client";

// Re-export Prisma-generated types for convenience
export type { Contract, ContractSignature, ContractAmendment };

/** Payload accepted by POST /contracts/from-offer/:offerId */
export interface CreateContractInput {
  offerId: string;
  jobId: string;
  jobTitle: string;
  jobDescription: string;
  employerId: string;
  employerName: string;
  employerEmail: string;
  employerAddress?: string;
  employerIdNumber?: string;
  contractorId: string;
  contractorName: string;
  contractorEmail: string;
  contractorAddress?: string;
  contractorIdNumber?: string;
  price: number;
  deadline?: string; // ISO 8601
  paymentMethod?: "OFFLINE" | "ESCROW";
  employerObligations?: string[];
  contractorObligations?: string[];
  place?: string;
}

export interface SignContractInput {
  otp: string;
}

export interface CreateAmendmentInput {
  title: string;
  content: string;
}

export interface OpenDisputeInput {
  reason: string;
}

export interface CancelInput {
  reason: string;
}

/** Injected into Fastify request by auth middleware */
export interface AuthUser {
  id: string;
  role: "EMPLOYER" | "CONTRACTOR";
  email: string;
  fullName: string;
}

/** Fastify request augmentation */
declare module "fastify" {
  interface FastifyRequest {
    authUser: AuthUser;
  }
}
