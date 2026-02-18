"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  budget_type: string | null;
  budget_min: number | null;
  budget_max: number | null;
  is_remote: boolean | null;
  skills: string[] | null;
  created_at: string;
  categories: unknown;
};

function getCategoryName(cat: unknown): string | null {
  if (!cat) return null;
  if (Array.isArray(cat)) return (cat[0] as { name?: string })?.name ?? null;
  return (cat as { name?: string })?.name ?? null;
}

const PAGE_SIZE = 12;

export default function JobsPage() {
  const searchParams = useSearchParams();
  const qFromUrl = searchParams.get("q") ?? "";

  const [jobs, setJobs] = useState<Job[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [cities, setCities] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState(qFromUrl);
  const [categoryId, setCategoryId] = useState("");
  const [city, setCity] = useState("");
  const [isRemote, setIsRemote] = useState<boolean | "">("");
  const [budgetType, setBudgetType] = useState("");
  const [sort, setSort] = useState<"newest" | "budget">("newest");

  useEffect(() => {
    setSearch(qFromUrl);
  }, [qFromUrl]);

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

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const searchTerm = search.trim() || qFromUrl.trim();
    const filters = {
      search: searchTerm,
      categoryId,
      city,
      isRemote,
      budgetType,
      sort,
      statusFilter: "published",
      ownerFilter: "none",
    };
    if (process.env.NODE_ENV === "development") {
      const { data: { user: listUser } } = await supabase.auth.getUser();
      console.log("[jobs] fetchJobs — auth user id on /jobs:", listUser?.id ?? "anonymous");
      console.log("[jobs] fetchJobs — exact filters (first load / current):", filters);
    }

    let query = supabase
      .from("jobs")
      .select("id, title, description, city, budget_type, budget_min, budget_max, is_remote, skills, created_at, category_id, categories(name)", { count: "exact" })
      .eq("status", "published");

    if (searchTerm) {
      query = query.or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);
    }
    if (categoryId) query = query.eq("category_id", Number(categoryId));
    if (city) query = query.eq("city", city);
    if (isRemote === true) query = query.eq("is_remote", true);
    if (budgetType) query = query.eq("budget_type", budgetType);

    if (sort === "newest") {
      query = query.order("created_at", { ascending: false });
    } else {
      query = query.order("budget_max", { ascending: false, nullsFirst: false });
    }

    const from = page * PAGE_SIZE;
    const { data, count, error } = await query.range(from, from + PAGE_SIZE - 1);

    if (process.env.NODE_ENV === "development") {
      console.log("[jobs] fetchJobs — rows:", (data as Job[])?.length ?? 0, "first row id:", (data as Job[])?.[0]?.id ?? "—", "count:", count ?? 0);
      console.log("[jobs] fetchJobs — error:", error ? { message: error.message, code: error.code, details: error.details, hint: error.hint } : null);
      const raw = await supabase.from("jobs").select("id, status, created_at").order("created_at", { ascending: false }).limit(5);
      console.log("[jobs] raw sanity (latest 5, no status filter):", raw.data?.length ?? 0, "rows:", raw.data, "error:", raw.error ? { message: raw.error.message, code: raw.error.code } : null);
      const lastId = typeof window !== "undefined" ? window.sessionStorage.getItem("jobs_debug_last_id") : null;
      if (lastId) {
        const byId = await supabase.from("jobs").select("*").eq("id", lastId).single();
        console.log("[jobs] verify-by-id (from create page):", lastId, "found:", !!byId.data, "error:", byId.error ? { message: byId.error.message, code: byId.error.code } : null);
        if (typeof window !== "undefined") window.sessionStorage.removeItem("jobs_debug_last_id");
      }
    }

    if (error) {
      setJobs([]);
      setTotal(0);
    } else {
      setJobs((data as Job[]) ?? []);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [page, search, qFromUrl, categoryId, city, isRemote, budgetType, sort]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 260px) 1fr", gap: 24, alignItems: "start" }} className="jobsLayout">
      {/* Left: filter panel */}
      <aside>
      <Card style={{ position: "sticky", top: 80 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600 }}>Filteri</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(0);
            fetchJobs();
          }}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: "var(--muted)" }}>Pretraži</label>
            <Input
              type="search"
              placeholder="Naslov ili opis..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: "var(--muted)" }}>Kategorija</label>
            <Select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(0); }}>
              <option value="">{sr.allCategories}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: "var(--muted)" }}>Grad</label>
            <Select value={city} onChange={(e) => { setCity(e.target.value); setPage(0); }}>
              <option value="">{sr.allCities}</option>
              {cities.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </Select>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={isRemote === true}
              onChange={(e) => { setIsRemote(e.target.checked ? true : ""); setPage(0); }}
              style={{ accentColor: "var(--accent)" }}
            />
            {sr.remoteOnly}
          </label>
          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: "var(--muted)" }}>Budžet</label>
            <Select value={budgetType} onChange={(e) => { setBudgetType(e.target.value); setPage(0); }}>
              <option value="">Svi</option>
              <option value="fixed">{sr.fixed}</option>
              <option value="hourly">{sr.hourly}</option>
            </Select>
          </div>
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

      {/* Right: job cards */}
      <div>
        <h1 style={{ margin: "0 0 20px", fontSize: 24, fontWeight: 600 }}>{sr.jobs}</h1>

        {loading ? (
          <p style={{ color: "var(--muted)" }}>{sr.loading}</p>
        ) : jobs.length === 0 ? (
          <Card>
            <p style={{ margin: 0, color: "var(--muted)" }}>{sr.noJobs}</p>
          </Card>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {jobs.map((job) => (
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
                        {getCategoryName(job.categories) && <Badge variant="muted">{getCategoryName(job.categories)}</Badge>}
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
                      <Link href={`/jobs/${job.id}`}>
                        <Button variant="primary">{sr.sendProposal}</Button>
                      </Link>
                    </div>
                  </div>
                </Card>
              ))}
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
