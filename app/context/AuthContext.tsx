"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
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
    if (process.env.NODE_ENV === "development") {
      console.log("[AuthContext] profile fetch result:", { userId, profile: profileData, error: error?.message });
    }
    return profileData;
  }, []);

  const refreshProfile = useCallback(async (userId?: string): Promise<Profile | null> => {
    const id = userId ?? user?.id;
    if (!id) return null;
    return fetchProfile(id);
  }, [user?.id, fetchProfile]);

  useEffect(() => {
    const init = async () => {
      const {
        data: { session: s },
      } = await supabase.auth.getSession();
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) await fetchProfile(s.user.id);
      setLoading(false);
      if (process.env.NODE_ENV === "development") {
        console.log("[AuthContext] init complete:", { hasSession: !!s, authUserId: s?.user?.id });
      }
    };
    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, s) => {
      if (process.env.NODE_ENV === "development") {
        console.log("[AuthContext] auth state change:", event, "userId:", s?.user?.id);
      }
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) await fetchProfile(s.user.id);
      else {
        setProfile(null);
        if (typeof window !== "undefined") {
          localStorage.removeItem(ONBOARDING_STORAGE_KEY);
          localStorage.removeItem(ONBOARDING_ROLE_KEY);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const onboardingCompleted = getOnboardingCompleted(profile);

  return (
    <AuthContext.Provider
      value={{ user, session, profile, loading, onboardingCompleted, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
