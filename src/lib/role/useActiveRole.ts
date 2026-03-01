"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/context/AuthContext";
import { supabase } from "@/src/lib/supabaseClient";

export type ActiveRole = "client" | "freelancer";
export type AccountType = "physical" | "legal";

export function useActiveRole(): {
  role: ActiveRole;
  isLoading: boolean;
  setRole: (newRole: ActiveRole) => Promise<void>;
  needsAccountTypeModal: boolean;
  setAccountTypeAndContinue: (value: AccountType) => Promise<void>;
} {
  const router = useRouter();
  const { user, profile, loading, refreshProfile } = useAuth();
  const [needsAccountTypeModal, setNeedsAccountTypeModal] = useState(false);

  const role: ActiveRole =
    profile?.active_role === "freelancer" ? "freelancer" : "client";
  const isLoading = loading;

  const setRole = useCallback(
    async (newRole: ActiveRole) => {
      if (!user) return;
      const account_type_before = profile?.account_type ?? null;
      if (process.env.NODE_ENV === "development") {
        console.debug("[useActiveRole] setRole called", { newRole, account_type_before });
      }
      const { error } = await supabase.rpc("set_active_role", { new_role: newRole });
      if (error) {
        if (process.env.NODE_ENV === "development") {
          console.debug("[useActiveRole] set_active_role error:", { code: error.code, message: error.message, details: error.details });
        }
        throw error;
      }
      const updated = await refreshProfile();
      router.refresh();
      const account_type_after = updated?.account_type ?? null;
      if (process.env.NODE_ENV === "development") {
        console.debug("[useActiveRole] after set_active_role", { newRole, account_type_after });
      }
      if (newRole === "freelancer" && !account_type_after) {
        setNeedsAccountTypeModal(true);
        return;
      }
      if (newRole === "client") router.push("/client/jobs");
      if (newRole === "freelancer") router.push("/freelancer/proposals");
    },
    [user, profile?.account_type, refreshProfile, router]
  );

  const setAccountTypeAndContinue = useCallback(
    async (value: AccountType) => {
      if (!user) return;
      if (process.env.NODE_ENV === "development") {
        console.debug("[useActiveRole] setAccountTypeAndContinue", { value });
      }
      const { error } = await supabase.rpc("set_account_type", { new_type: value });
      if (error) throw error;
      const updated = await refreshProfile();
      if (process.env.NODE_ENV === "development") {
        console.debug("[useActiveRole] after set_account_type", { account_type_after: updated?.account_type });
      }
      setNeedsAccountTypeModal(false);
      router.refresh();
      router.push("/freelancer/proposals");
    },
    [user, refreshProfile, router]
  );

  return { role, isLoading, setRole, needsAccountTypeModal, setAccountTypeAndContinue };
}
