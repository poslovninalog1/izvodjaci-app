import { randomUUID } from "node:crypto";
import type { AuthUser, CreateContractInput } from "../src/types.js";

export function mockEmployer(overrides?: Partial<AuthUser>): AuthUser {
  return {
    id: randomUUID(),
    role: "EMPLOYER",
    email: "employer@test.com",
    fullName: "Test Employer",
    ...overrides,
  };
}

export function mockContractor(overrides?: Partial<AuthUser>): AuthUser {
  return {
    id: randomUUID(),
    role: "CONTRACTOR",
    email: "contractor@test.com",
    fullName: "Test Contractor",
    ...overrides,
  };
}

export function mockCreateInput(
  employer: AuthUser,
  contractor: AuthUser,
  overrides?: Partial<CreateContractInput>,
): CreateContractInput {
  return {
    offerId: randomUUID(),
    jobId: randomUUID(),
    jobTitle: "Test Job",
    jobDescription: "Build something great.",
    employerId: employer.id,
    employerName: employer.fullName,
    employerEmail: employer.email,
    contractorId: contractor.id,
    contractorName: contractor.fullName,
    contractorEmail: contractor.email,
    price: 5000,
    deadline: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
    paymentMethod: "OFFLINE",
    employerObligations: ["Provide specifications", "Pay on time"],
    contractorObligations: ["Deliver on deadline", "Follow spec"],
    ...overrides,
  };
}
