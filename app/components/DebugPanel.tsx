"use client";

/**
 * Dev-only panel to verify auth/profile/errors. Remove in production.
 */
export default function DebugPanel({
  userId,
  profileRole,
  onboardingCompleted,
  lastError,
}: {
  userId: string | undefined;
  profileRole: string | undefined | null;
  onboardingCompleted: boolean | undefined;
  lastError: string | null;
}) {
  if (process.env.NODE_ENV !== "development") return null;

  return (
    <div
      style={{
        marginTop: 16,
        padding: 12,
        background: "#f8fafc",
        color: "var(--text)",
        fontSize: 12,
        fontFamily: "monospace",
        borderRadius: 6,
        border: "1px solid var(--border)",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Debug (dev only)</div>
      <div>user.id: {userId ?? "—"}</div>
      <div>profile.role: {String(profileRole ?? "—")}</div>
      <div>onboardingCompleted: {String(onboardingCompleted ?? "—")}</div>
      {lastError && (
        <div style={{ color: "var(--danger)", marginTop: 6 }}>last error: {lastError}</div>
      )}
    </div>
  );
}
