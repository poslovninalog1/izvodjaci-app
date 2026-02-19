import { describe, it, expect } from "vitest";
import {
  sha256,
  hashOtp,
  generateSalt,
  generateOtpCode,
} from "../src/utils/hash.js";
import { sanitize } from "../src/utils/sanitize.js";

describe("sha256", () => {
  it("returns consistent hex hash for the same input", () => {
    const a = sha256("hello");
    const b = sha256("hello");
    expect(a).toBe(b);
    expect(a).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it("produces different hashes for different inputs", () => {
    expect(sha256("a")).not.toBe(sha256("b"));
  });

  it("works with buffers", () => {
    const buf = Buffer.from("test data");
    const hash = sha256(buf);
    expect(hash).toHaveLength(64);
  });
});

describe("OTP helpers", () => {
  it("generateOtpCode returns a 6-digit string", () => {
    for (let i = 0; i < 20; i++) {
      const code = generateOtpCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it("generateSalt returns a 32-char hex string", () => {
    const salt = generateSalt();
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
  });

  it("hashOtp produces deterministic output for same code+salt", () => {
    const salt = generateSalt();
    const code = "123456";
    expect(hashOtp(code, salt)).toBe(hashOtp(code, salt));
  });

  it("hashOtp produces different output for different salts", () => {
    const code = "123456";
    const s1 = generateSalt();
    const s2 = generateSalt();
    expect(hashOtp(code, s1)).not.toBe(hashOtp(code, s2));
  });

  it("hashOtp produces different output for different codes", () => {
    const salt = generateSalt();
    expect(hashOtp("000000", salt)).not.toBe(hashOtp("111111", salt));
  });
});

describe("sanitize", () => {
  it("strips HTML tags", () => {
    expect(sanitize("<b>bold</b>")).toBe("bold");
    expect(sanitize('<script>alert("xss")</script>')).toBe('alert("xss")');
  });

  it("strips control characters", () => {
    expect(sanitize("hello\x00world")).toBe("helloworld");
  });

  it("preserves normal text", () => {
    const text = "Build a website for 5000 EUR. Deadline: 2026-03-01.";
    expect(sanitize(text)).toBe(text);
  });

  it("handles empty string", () => {
    expect(sanitize("")).toBe("");
  });
});
