"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { components } from "@/shared/api/schema";

export type Me = components["schemas"]["MeOut"];

const MeContext = createContext<Me | null>(null);

/** Hands the server-fetched `/api/me` payload to client components under the shell. */
export function MeProvider({ me, children }: { me: Me; children: ReactNode }) {
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}

export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe must be used inside <MeProvider>");
  return me;
}
