"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/src/lib/supabase/client";
import { useAuth } from "../context/AuthContext";
import Logo from "../components/Logo";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import Button from "../components/ui/Button";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshProfile } = useAuth();
  const next = searchParams.get("next") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      fetch("/api/health/supabase")
        .then((r) => r.json())
        .then((d) => console.log("[login] supabase health:", d))
        .catch(() => {});
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (err) {
        console.error("[login] signIn error:", err.message);
        setError(err.message);
        return;
      }
      const { data: { user: u } } = await supabase.auth.getUser();
      if (u) await refreshProfile(u.id);
      router.push(next);
      router.refresh();
    } catch (err) {
      console.error("[login] fetch error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("fetch") || msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        setError(
          "Neuspješan kontakt sa Supabase URL-om. Provjeri NEXT_PUBLIC_SUPABASE_URL " +
          "i da li je Supabase projekat aktivan."
        );
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "40px auto" }}>
      <div style={{ marginBottom: 32, textAlign: "center" }}>
        <Logo href="/jobs" size="lg" />
      </div>
      <Card>
        <h1 style={{ margin: "0 0 20px", fontSize: 24, fontWeight: 600 }}>Prijava</h1>
        <form onSubmit={submit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "var(--muted)" }}>Email</label>
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "var(--muted)" }}>Lozinka</label>
            <Input
              type="password"
              placeholder="Lozinka"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p style={{ color: "var(--danger)", marginBottom: 12, fontSize: 13 }}>{error}</p>}
          <Button type="submit" variant="primary" disabled={loading} style={{ width: "100%" }}>
            {loading ? "Prijava..." : "Prijavi se"}
          </Button>
        </form>
        <p style={{ marginTop: 16, fontSize: 14, color: "var(--muted)" }}>
          Nemaš nalog? <Link href="/register" style={{ color: "var(--accent)" }}>Registruj se</Link>
        </p>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ maxWidth: 400, margin: "40px auto", padding: 16, color: "var(--muted)" }}>Učitavanje...</div>}>
      <LoginForm />
    </Suspense>
  );
}
