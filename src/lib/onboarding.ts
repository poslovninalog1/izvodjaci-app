/**
 * Client-only: onboarding completed = localStorage flag "onboarding_completed" === "1".
 * Do NOT rely on DB column onboarding_completed (may not exist).
 * When profile has no role (e.g. DB has no role column), localStorage alone determines completion so flow can finish.
 */
export function getOnboardingCompleted(_profile: { role?: string | null } | null | undefined): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("onboarding_completed") === "1";
}

export const ONBOARDING_STORAGE_KEY = "onboarding_completed";
export const ONBOARDING_ROLE_KEY = "onboarding_role";

export function getOnboardingRole(): "client" | "freelancer" | null {
  if (typeof window === "undefined") return null;
  const r = localStorage.getItem(ONBOARDING_ROLE_KEY);
  return r === "client" || r === "freelancer" ? r : null;
}

export function isClientForApp(profile: { role?: string | null } | null | undefined): boolean {
  const role = profile?.role;
  if (role === "client") return true;
  return getOnboardingRole() === "client";
}
