"use client";

import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";

export default function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <button className="tabBtn" type="button" onClick={handleLogout}>
      Odjavi se
    </button>
  );
}
