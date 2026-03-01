"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { supabase } from "@/src/lib/supabaseClient";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Input from "../components/ui/Input";
import Select from "../components/ui/Select";
import Button from "../components/ui/Button";
import { sr } from "@/src/lib/strings/sr";

type Job = {
  id: number;
  title: string | null;
  description: string | null;
  city: string | null;
  category_id: number | null;
  client_id: string | null;
  budget_min: number | null;
  budget_max: number | null;
  budget_type: string | null;
  is_remote: boolean | null;
  created_at: string;
  status: string | null;
};

const PAGE_SIZE = 12;
const DEV = typeof window !== "undefined" && process.env.NODE_ENV === "development";

// ── Default filter values ──────────────────────────────────────────────────
const DEFAULT_CATEGORY = "";
const DEFAULT_CITY = "";
const DEFAULT_IS_REMOTE: boolean | "" = "";
const DEFAULT_BUDGET_TYPE = "";
const DEFAULT_BUDGET_MIN = "";
const DEFAULT_BUDGET_MAX = "";
const DEFAULT_SORT: "newest" | "budget" = "newest";

export default function JobsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [cities, setCities] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // ── Filter state ───────────────────────────────────────────────────────
  const [categoryId, setCategoryId] = useState(DEFAULT_CATEGORY);
  const [city, setCity] = useState(DEFAULT_CITY);
  const [isRemote, setIsRemote] = useState<boolean | "">(DEFAULT_IS_REMOTE);
  const [budgetType, setBudgetType] = useState(DEFAULT_BUDGET_TYPE);
  const [budgetMin, setBudgetMin] = useState(DEFAULT_BUDGET_MIN);
  const [budgetMax, setBudgetMax] = useState(DEFAULT_BUDGET_MAX);
  const [sort, setSort] = useState<"newest" | "budget">(DEFAULT_SORT);

  const requestIdRef = useRef(0);

  // ── Load categories + cities once ─────────────────────────────────────
  useEffect(() => {
    async function loadOptions() {
      const [catRes, cityRes] = await Promise.all([
        supabase.from("categories").select("id, name").order("sort_order"),
        supabase.from("cities").select("id, name").order("sort_order"),
      ]);
      if (catRes.data) setCategories(catRes.data);
      if (cityRes.data) setCities(cityRes.data);
    }
    loadOptions();
  }, []);

  // ── Category name map (stable ref, no extra renders) ──────────────────
  const categoryMap = useRef<Map<number, string>>(new Map());
  useEffect(() => {
    const m = new Map<number, string>();
    for (const c of categories) m.set(c.id, c.name);
    categoryMap.current = m;
  }, [categories]);

  // ── Fetch jobs ─────────────────────────────────────────────────────────
  const fetchJobs = useCallback(async () => {
    const rid = ++requestIdRef.current;
    if (DEV) console.log("[jobs] fetch start", { reqId: rid, page, categoryId, city, isRemote, budgetType, budgetMin, budgetMax, sort });

    setLoading(true);
    setFetchError(null);

    try {
      let query = supabase
        .from("jobs")
        .select("id, title, description, city, category_id, client_id, budget_min, budget_max, budget_type, is_remote, created_at, status", { count: "exact" })
        .eq("status", "published");

      if (categoryId) query = query.eq("category_id", Number(categoryId));
      if (city) query = query.eq("city", city);
      if (isRemote === true) query = query.eq("is_remote", true);
      if (budgetType) query = query.eq("budget_type", budgetType);
      if (budgetMin) query = query.gte("budget_max", Number(budgetMin));
      if (budgetMax) query = query.lte("budget_min", Number(budgetMax));

      if (sort === "newest") {
        query = query.order("created_at", { ascending: false });
      } else {
        query = query.order("budget_max", { ascending: false, nullsFirst: false });
      }

      const from = page * PAGE_SIZE;
      const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);

      if (DEV) console.log("[jobs] fetch end", { reqId: rid, currentReqId: requestIdRef.current, count, isStale: rid !== requestIdRef.current });

      // Discard stale responses — but loading MUST still be cleared in finally
      if (rid !== requestIdRef.current) return;

      if (error) {
        if (DEV) console.error("[jobs] Supabase error", { code: error.code, message: error.message, details: error.details });
        setFetchError(error.message || "Greška pri učitavanju poslova.");
        setJobs([]);
        setTotal(0);
      } else {
        setJobs((data as Job[]) ?? []);
        setTotal(count ?? 0);
      }
    } catch (err) {
      if (DEV) console.error("[jobs] exception", err);
      if (rid !== requestIdRef.current) return;
      setFetchError("Greška pri učitavanju poslova.");
      setJobs([]);
      setTotal(0);
    } finally {
      // Always clear loading — regardless of stale-request check.
      // Leaving loading=true forever is worse than a minor flicker.
      if (DEV) console.log("[jobs] loading=false", { reqId: rid });
      setLoading(false);
    }
  }, [page, categoryId, city, isRemote, budgetType, budgetMin, budgetMax, sort]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // ── Reset all filters ──────────────────────────────────────────────────
  function resetFilters() {
    setCategoryId(DEFAULT_CATEGORY);
    setCity(DEFAULT_CITY);
    setIsRemote(DEFAULT_IS_REMOTE);
    setBudgetType(DEFAULT_BUDGET_TYPE);
    setBudgetMin(DEFAULT_BUDGET_MIN);
    setBudgetMax(DEFAULT_BUDGET_MAX);
    setSort(DEFAULT_SORT);
    setPage(0);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 260px) 1fr", gap: 24, alignItems: "start" }} className="jobsLayout">

      {/* ── Left: filter panel ── */}
      <aside>
        <Card style={{ position: "sticky", top: 80 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Filteri</h3>
            <button
              type="button"
              onClick={resetFilters}
              style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              Resetuj
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(0);
              fetchJobs();
            }}
            style={{ display: "flex", flexDirection: "column", gap: 12 }}
          >
            {/* Category */}
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: "var(--muted)" }}>Kategorija</label>
              <Select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(0); }}>
                <option value="">{sr.allCategories}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>

            {/* City */}
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: "var(--muted)" }}>Grad</label>
              <Select value={city} onChange={(e) => { setCity(e.target.value); setPage(0); }}>
                <option value="">{sr.allCities}</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </Select>
            </div>

            {/* Remote */}
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={isRemote === true}
                onChange={(e) => { setIsRemote(e.target.checked ? true : ""); setPage(0); }}
                style={{ accentColor: "var(--accent)" }}
              />
              {sr.remoteOnly}
            </label>

            {/* Budget type */}
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: "var(--muted)" }}>Tip budžeta</label>
              <Select value={budgetType} onChange={(e) => { setBudgetType(e.target.value); setPage(0); }}>
                <option value="">Svi</option>
                <option value="fixed">{sr.fixed}</option>
                <option value="hourly">{sr.hourly}</option>
              </Select>
            </div>

            {/* Budget range */}
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: "var(--muted)" }}>Budžet (€)</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Input
                  type="number"
                  min="0"
                  placeholder="Min"
                  value={budgetMin}
                  onChange={(e) => { setBudgetMin(e.target.value); setPage(0); }}
                />
                <Input
                  type="number"
                  min="0"
                  placeholder="Max"
                  value={budgetMax}
                  onChange={(e) => { setBudgetMax(e.target.value); setPage(0); }}
                />
              </div>
            </div>

            {/* Sort */}
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: "var(--muted)" }}>Sortiraj</label>
              <Select value={sort} onChange={(e) => { setSort(e.target.value as "newest" | "budget"); setPage(0); }}>
                <option value="newest">{sr.newest}</option>
                <option value="budget">Budžet (visok→nizak)</option>
              </Select>
            </div>

            <Button type="submit" variant="primary">{sr.apply}</Button>
          </form>
        </Card>
      </aside>

      {/* ── Right: job cards ── */}
      <div>
        <h1 style={{ margin: "0 0 20px", fontSize: 24, fontWeight: 600 }}>{sr.jobs}</h1>

        {fetchError && (
          <Card style={{ marginBottom: 16, borderColor: "var(--danger)", color: "var(--danger)" }}>
            <p style={{ margin: 0 }}>{fetchError}</p>
          </Card>
        )}

        {loading ? (
          <p style={{ color: "var(--muted)" }}>{sr.loading}</p>
        ) : jobs.length === 0 ? (
          <Card>
            <p style={{ margin: 0, color: "var(--muted)" }}>{fetchError ? "" : sr.noJobs}</p>
          </Card>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {jobs.map((job) => {
                const catName = job.category_id ? categoryMap.current.get(job.category_id) : null;
                return (
                  <Card key={job.id} style={{ padding: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Link href={`/jobs/${job.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                          <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 600 }}>
                            {job.title || "Bez naslova"}
                          </h3>
                        </Link>
                        <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", lineHeight: 1.5 }}>
                          {(job.description || "").slice(0, 120)}
                          {(job.description?.length ?? 0) > 120 ? "…" : ""}
                        </p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                          {catName && <Badge variant="muted">{catName}</Badge>}
                          {job.city && <Badge variant="muted">{job.city}</Badge>}
                          {job.is_remote && <Badge variant="accent">Remote</Badge>}
                          <span style={{ fontSize: 13, color: "var(--muted)" }}>
                            {job.created_at ? new Date(job.created_at).toLocaleDateString("sr-Latn") : ""}
                          </span>
                        </div>
                        {(job.budget_max != null || job.budget_min != null) && (
                          <p style={{ margin: "4px 0 0", fontSize: 15, fontWeight: 600, color: "var(--accent)" }}>
                            {job.budget_type === "hourly"
                              ? `${job.budget_min ?? "?"}–${job.budget_max ?? "?"} €/h`
                              : `do ${job.budget_max ?? job.budget_min} €`}
                          </p>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                        <Link href={`/jobs/${job.id}`}>
                          <Button variant="secondary">{sr.view}</Button>
                        </Link>
                        <Button
                          variant="primary"
                          onClick={() => {
                            const path = `/jobs/${job.id}?action=proposal`;
                            if (!user) router.push(`/login?next=${encodeURIComponent(path)}`);
                            else router.push(path);
                          }}
                        >
                          {sr.sendProposal}
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 24 }}>
                <Button
                  variant="secondary"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  {sr.previous}
                </Button>
                <span style={{ fontSize: 14, color: "var(--muted)" }}>
                  {sr.page} {page + 1} / {totalPages} ({total} poslova)
                </span>
                <Button
                  variant="secondary"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                >
                  {sr.next}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
