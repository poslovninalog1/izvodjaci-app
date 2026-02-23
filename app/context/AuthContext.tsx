"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/src/lib/supabaseClient";
import { getOnboardingCompleted, ONBOARDING_STORAGE_KEY, ONBOARDING_ROLE_KEY } from "@/src/lib/onboarding";

/** Matches actual DB: id, name, municipalities, skills, price_from, rating, deactivated, created_at; role may exist. */
export type Profile = {
  id: string;
  role?: "client" | "freelancer" | "admin" | null;
  name?: string | null;
  municipalities?: string | null;
  skills?: string | null;
  price_from?: number | null;
  rating?: number | null;
  deactivated?: boolean;
  created_at?: string | null;
  full_name?: string | null;
  city?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
};

type AuthState = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** Client-derived: localStorage flag + profile.role (do not use DB onboarding_completed). */
  onboardingCompleted: boolean;
  refreshProfile: (userId?: string) => Promise<Profile | null>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    const profileData = data as Profile | null;
    setProfile(profileData);
    return profileData;
  }, []);

  const refreshProfile = useCallback(async (userId?: string): Promise<Profile | null> => {
    const id = userId ?? user?.id;
    if (!id) return null;
    return fetchProfile(id);
  }, [user?.id, fetchProfile]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const {
          data: { session: s },
        } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) {
          fetchProfile(s.user.id).catch(() => {});
        }
      } catch {
        // getSession() failed or threw — loading still cleared in finally
      } finally {
        if (mounted) setLoading(false);
      }
    };
    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfile(s.user.id).catch(() => {});
      } else {
        setProfile(null);
        if (typeof window !== "undefined") {
          localStorage.removeItem(ONBOARDING_STORAGE_KEY);
          localStorage.removeItem(ONBOARDING_ROLE_KEY);
        }
      }
      // On sign out or session change, profile is cleared; components that key
      // off user?.id (e.g. InboxSidebar with key={user?.id}) will refetch and
      // clear cached inbox list / modal state so we never show another account's data.
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const onboardingCompleted = getOnboardingCompleted(profile);

  const value = useMemo<AuthState>(() => ({
    user, session, profile, loading, onboardingCompleted, refreshProfile,
  }), [user, session, profile, loading, onboardingCompleted, refreshProfile]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
