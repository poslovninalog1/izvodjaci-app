import { describe, it, expect } from "vitest";
import { ContractStatus } from "@prisma/client";
import { canTransition, assertTransition, TERMINAL, SIGNABLE } from "../src/state-machine.js";

describe("Contract state machine", () => {
  const VALID_PAIRS: [ContractStatus, ContractStatus][] = [
    [ContractStatus.DRAFT, ContractStatus.PENDING_SIGNATURES],
    [ContractStatus.DRAFT, ContractStatus.CANCELLED],
    [ContractStatus.PENDING_SIGNATURES, ContractStatus.PARTIALLY_SIGNED],
    [ContractStatus.PENDING_SIGNATURES, ContractStatus.CANCELLED],
    [ContractStatus.PARTIALLY_SIGNED, ContractStatus.SIGNED],
    [ContractStatus.PARTIALLY_SIGNED, ContractStatus.CANCELLED],
    [ContractStatus.SIGNED, ContractStatus.DISPUTED],
    [ContractStatus.DISPUTED, ContractStatus.RESOLVED],
  ];

  const INVALID_PAIRS: [ContractStatus, ContractStatus][] = [
    [ContractStatus.DRAFT, ContractStatus.SIGNED],
    [ContractStatus.DRAFT, ContractStatus.DISPUTED],
    [ContractStatus.PENDING_SIGNATURES, ContractStatus.SIGNED],
    [ContractStatus.PARTIALLY_SIGNED, ContractStatus.DISPUTED],
    [ContractStatus.SIGNED, ContractStatus.PENDING_SIGNATURES],
    [ContractStatus.SIGNED, ContractStatus.CANCELLED],
    [ContractStatus.CANCELLED, ContractStatus.DRAFT],
    [ContractStatus.CANCELLED, ContractStatus.SIGNED],
    [ContractStatus.RESOLVED, ContractStatus.SIGNED],
    [ContractStatus.RESOLVED, ContractStatus.DISPUTED],
  ];

  describe("canTransition", () => {
    for (const [from, to] of VALID_PAIRS) {
      it(`allows ${from} → ${to}`, () => {
        expect(canTransition(from, to)).toBe(true);
      });
    }

    for (const [from, to] of INVALID_PAIRS) {
      it(`rejects ${from} → ${to}`, () => {
        expect(canTransition(from, to)).toBe(false);
      });
    }
  });

  describe("assertTransition", () => {
    it("does not throw for valid transitions", () => {
      for (const [from, to] of VALID_PAIRS) {
        expect(() => assertTransition(from, to)).not.toThrow();
      }
    });

    it("throws for invalid transitions with descriptive message", () => {
      expect(() =>
        assertTransition(ContractStatus.SIGNED, ContractStatus.CANCELLED),
      ).toThrow("Invalid status transition: SIGNED → CANCELLED");
    });
  });

  describe("constant sets", () => {
    it("TERMINAL includes CANCELLED and RESOLVED", () => {
      expect(TERMINAL.has(ContractStatus.CANCELLED)).toBe(true);
      expect(TERMINAL.has(ContractStatus.RESOLVED)).toBe(true);
      expect(TERMINAL.has(ContractStatus.SIGNED)).toBe(false);
    });

    it("SIGNABLE includes PENDING_SIGNATURES and PARTIALLY_SIGNED", () => {
      expect(SIGNABLE.has(ContractStatus.PENDING_SIGNATURES)).toBe(true);
      expect(SIGNABLE.has(ContractStatus.PARTIALLY_SIGNED)).toBe(true);
      expect(SIGNABLE.has(ContractStatus.SIGNED)).toBe(false);
      expect(SIGNABLE.has(ContractStatus.DRAFT)).toBe(false);
    });
  });

  describe("terminal states have no outbound transitions", () => {
    for (const status of TERMINAL) {
      it(`${status} cannot transition to anything`, () => {
        for (const target of Object.values(ContractStatus)) {
          expect(canTransition(status, target)).toBe(false);
        }
      });
    }
  });
});
