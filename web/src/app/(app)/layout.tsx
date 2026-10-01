import type { ReactNode } from "react";
import { MeProvider } from "@/features/auth/MeProvider";
import { ShellHeader } from "@/features/auth/containers/ShellHeader";
import { requireMe } from "@/features/auth/server/requireMe";

/** Everything under (app) needs a session: `requireMe` redirects to /login on 401. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const me = await requireMe();

  return (
    <MeProvider me={me}>
      <ShellHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-6">
        {children}
      </main>
    </MeProvider>
  );
}
