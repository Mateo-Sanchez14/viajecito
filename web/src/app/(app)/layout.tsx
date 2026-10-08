import type { ReactNode } from "react";
import { MeProvider } from "@/features/auth/MeProvider";
import { ShellHeader } from "@/features/auth/containers/ShellHeader";
import { requireMe } from "@/features/auth/server/requireMe";
import { QuickCaptureContainer } from "@/features/capture/containers/QuickCaptureContainer";
import { AppAtmosphere } from "@/ui/molecules/AppAtmosphere";

/** Everything under (app) needs a session: `requireMe` redirects to /login on 401. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const me = await requireMe();

  return (
    <MeProvider me={me}>
      <AppAtmosphere />
      <ShellHeader />
      <main className="app-canvas mx-auto flex w-full flex-1 flex-col gap-8">
        {children}
      </main>
      <QuickCaptureContainer />
    </MeProvider>
  );
}
