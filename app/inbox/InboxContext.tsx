"use client";

import { createContext, useCallback, useContext, useState } from "react";

type InboxContextValue = {
  refreshTrigger: number;
  triggerRefresh: () => void;
  clearedReadId: string | null;
  setClearedReadId: (id: string | null) => void;
};

const InboxContext = createContext<InboxContextValue | null>(null);

export function InboxProvider({ children }: { children: React.ReactNode }) {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [clearedReadId, setClearedReadId] = useState<string | null>(null);
  const triggerRefresh = useCallback(() => {
    setRefreshTrigger((t) => t + 1);
  }, []);
  return (
    <InboxContext.Provider
      value={{ refreshTrigger, triggerRefresh, clearedReadId, setClearedReadId }}
    >
      {children}
    </InboxContext.Provider>
  );
}

export function useInboxContext() {
  const ctx = useContext(InboxContext);
  return ctx;
}
