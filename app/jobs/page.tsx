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
import FilterDrawer from "./FilterDrawer";
import JobsRightSidebar from "./JobsRightSidebar";

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

const DEFAULT_CATEGORY = "";
const DEFAULT_CITY = "";
const DEFAULT_IS_REMOTE: boolean | "" = "";
const DEFAULT_BUDGET_TYPE = "";
const DEFAULT_BUDGET_MIN = "";
const DEFAULT_BUDGET_MAX = "";
const DEFAULT_SORT: "newest" | "budget" = "newest";

type TabId = "best" | "newest" | "saved";

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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("best");

  const [categoryId, setCategoryId] = useState(DEFAULT_CATEGORY);
  const [city, setCity] = useState(DEFAULT_CITY);
  const [isRemote, setIsRemote] = useState<boolean | "">(DEFAULT_IS_REMOTE);
  const [budgetType, setBudgetType] = useState(DEFAULT_BUDGET_TYPE);
  const [budgetMin, setBudgetMin] = useState(DEFAULT_BUDGET_MIN);
  const [budgetMax, setBudgetMax] = useState(DEFAULT_BUDGET_MAX);
  const [sort, setSort] = useState<"newest" | "budget">(DEFAULT_SORT);

  const requestIdRef = useRef(0);
  const categoryMap = useRef<Map<number, string>>(new Map());

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

  useEffect(() => {
    const m = new Map<number, string>();
    for (const c of categories) m.set(c.id, c.name);
    categoryMap.current = m;
  }, [categories]);

  const fetchJobs = useCallback(async () => {
    const rid = ++requestIdRef.current;
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

      if (rid !== requestIdRef.current) return;
      if (error) {
        setFetchError(error.message || "Greška pri učitavanju poslova.");
        setJobs([]);
        setTotal(0);
      } else {
        setJobs((data as Job[]) ?? []);
        setTotal(count ?? 0);
      }
    } catch {
      if (requestIdRef.current === requestIdRef.current) {
        setFetchError("Greška pri učitavanju poslova.");
        setJobs([]);
        setTotal(0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, categoryId, city, isRemote, budgetType, budgetMin, budgetMax, sort]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Sync tab with sort (UI: "Najnoviji" = newest, "Najbolji mečevi" = best)
  useEffect(() => {
    if (activeTab === "newest") setSort("newest");
    if (activeTab === "best") setSort("newest");
  }, [activeTab]);

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

  function applyFiltersAndClose() {
    setPage(0);
    fetchJobs();
    setFiltersOpen(false);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const filterForm = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        applyFiltersAndClose();
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-gray-700">Filteri</span>
        <button
          type="button"
          onClick={resetFilters}
          className="text-xs text-[var(--accent)] bg-transparent border-none cursor-pointer p-0"
        >
          Resetuj
        </button>
      </div>
      <div>
        <label className="block mb-1 text-xs text-[var(--muted)]">Kategorija</label>
        <Select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(0); }}>
          <option value="">{sr.allCategories}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </div>
      <div>
        <label className="block mb-1 text-xs text-[var(--muted)]">Grad</label>
        <Select value={city} onChange={(e) => { setCity(e.target.value); setPage(0); }}>
          <option value="">{sr.allCities}</option>
          {cities.map((c) => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </Select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isRemote === true}
          onChange={(e) => { setIsRemote(e.target.checked ? true : ""); setPage(0); }}
          style={{ accentColor: "var(--accent)" }}
        />
        {sr.remoteOnly}
      </label>
      <div>
        <label className="block mb-1 text-xs text-[var(--muted)]">Tip budžeta</label>
        <Select value={budgetType} onChange={(e) => { setBudgetType(e.target.value); setPage(0); }}>
          <option value="">Svi</option>
          <option value="fixed">{sr.fixed}</option>
          <option value="hourly">{sr.hourly}</option>
        </Select>
      </div>
      <div>
        <label className="block mb-1 text-xs text-[var(--muted)]">Budžet (€)</label>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            min={0}
            placeholder="Min"
            value={budgetMin}
            onChange={(e) => { setBudgetMin(e.target.value); setPage(0); }}
          />
          <Input
            type="number"
            min={0}
            placeholder="Max"
            value={budgetMax}
            onChange={(e) => { setBudgetMax(e.target.value); setPage(0); }}
          />
        </div>
      </div>
      <div>
        <label className="block mb-1 text-xs text-[var(--muted)]">Sortiraj</label>
        <Select value={sort} onChange={(e) => { setSort(e.target.value as "newest" | "budget"); setPage(0); }}>
          <option value="newest">{sr.newest}</option>
          <option value="budget">Budžet (visok→nizak)</option>
        </Select>
      </div>
      <Button type="submit" variant="primary">{sr.apply}</Button>
    </form>
  );

  return (
    <div className="jobsLayout max-w-[1400px] mx-auto w-full">
      {/* Top: search + tabs + Filteri button */}
      <div className="mb-6">
        <div className="mb-4">
          <input
            type="search"
            placeholder="Pretraži poslove"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="premium-focus w-full max-w-xl px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 text-sm"
            aria-label="Pretraži poslove"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
            <button
              type="button"
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === "best" ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-50"
              }`}
              onClick={() => setActiveTab("best")}
            >
              Najbolji mečevi
            </button>
            <button
              type="button"
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === "newest" ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-50"
              }`}
              onClick={() => setActiveTab("newest")}
            >
              Najnoviji
            </button>
            <Link
              href="/jobs/saved"
              className="px-4 py-2 text-sm font-medium rounded-md transition-colors no-underline text-gray-600 hover:bg-gray-50"
            >
              Sačuvani poslovi
            </Link>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setFiltersOpen(true)}
            className="premium-btn"
          >
            Filteri
          </Button>
        </div>
      </div>

      {/* Main + right sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8 items-start">
        <div className="min-w-0">
          <h1 className="m-0 mb-5 text-2xl font-semibold text-gray-900">{sr.jobs}</h1>

          {fetchError && (
            <Card style={{ marginBottom: 16, borderColor: "var(--danger)", color: "var(--danger)" }}>
              <p className="m-0">{fetchError}</p>
            </Card>
          )}

          {loading ? (
            <p className="text-[var(--muted)]">{sr.loading}</p>
          ) : jobs.length === 0 ? (
            <div className="premium-card-base rounded-xl p-5">
              <p className="m-0 text-[var(--muted)]">{fetchError ? "" : sr.noJobs}</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3">
                {jobs.map((job) => {
                  const catName = job.category_id ? categoryMap.current.get(job.category_id) : null;
                  return (
                    <div
                      key={job.id}
                      className="premium-card premium-card-base premium-card-tilt rounded-xl p-5"
                    >
                      <div className="flex flex-wrap justify-between items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <Link href={`/jobs/${job.id}`} className="no-underline text-inherit">
                            <h3 className="m-0 mb-2 text-lg font-semibold text-gray-900">
                              {job.title || "Bez naslova"}
                            </h3>
                          </Link>
                          <p className="m-0 text-sm text-[var(--muted)] leading-snug">
                            {(job.description || "").slice(0, 120)}
                            {(job.description?.length ?? 0) > 120 ? "…" : ""}
                          </p>
                          <div className="flex flex-wrap gap-2 mt-3">
                            {catName && <Badge variant="muted">{catName}</Badge>}
                            {job.city && <Badge variant="muted">{job.city}</Badge>}
                            {job.is_remote && <Badge variant="accent">Remote</Badge>}
                            <span className="text-xs text-[var(--muted)]">
                              {job.created_at ? new Date(job.created_at).toLocaleDateString("sr-Latn") : ""}
                            </span>
                          </div>
                          {(job.budget_max != null || job.budget_min != null) && (
                            <p className="mt-1 text-[15px] font-semibold text-[var(--accent)]">
                              {job.budget_type === "hourly"
                                ? `${job.budget_min ?? "?"}–${job.budget_max ?? "?"} €/h`
                                : `do ${job.budget_max ?? job.budget_min} €`}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Link href={`/jobs/${job.id}`}>
                            <Button variant="secondary" className="premium-btn">{sr.view}</Button>
                          </Link>
                          <Button
                            variant="primary"
                            className="premium-btn"
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
                    </div>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div className="flex gap-3 items-center mt-6">
                  <Button
                    variant="secondary"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className="premium-btn"
                  >
                    {sr.previous}
                  </Button>
                  <span className="text-sm text-[var(--muted)]">
                    {sr.page} {page + 1} / {totalPages} ({total} poslova)
                  </span>
                  <Button
                    variant="secondary"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    className="premium-btn"
                  >
                    {sr.next}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        <JobsRightSidebar />
      </div>

      <FilterDrawer open={filtersOpen} onClose={() => setFiltersOpen(false)}>
        {filterForm}
      </FilterDrawer>
    </div>
  );
}
