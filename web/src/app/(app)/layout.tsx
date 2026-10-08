import type { ReactNode } from "react";
import { MeProvider } from "@/features/auth/MeProvider";
import { ShellHeader } from "@/features/auth/containers/ShellHeader";
import { requireMe } from "@/features/auth/server/requireMe";
import { QuickCaptureContainer } from "@/features/capture/containers/QuickCaptureContainer";
import { TourContainer } from "@/features/onboarding/containers/TourContainer";
import { TourProvider } from "@/features/onboarding/TourProvider";
import { AppAtmosphere } from "@/ui/molecules/AppAtmosphere";

/** Everything under (app) needs a session: `requireMe` redirects to /login on 401. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const me = await requireMe();

  return (
    <MeProvider me={me}>
      <TourProvider>
        <AppAtmosphere />
        <ShellHeader />
        <main className="app-canvas mx-auto flex w-full flex-1 flex-col gap-8">
          {children}
        </main>
        <QuickCaptureContainer />
        <TourContainer />
      </TourProvider>
    </MeProvider>
  );
}
