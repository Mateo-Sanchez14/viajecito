import type { ReactNode } from "react";

/** Public routes (no session needed): centered, chrome-free. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full flex-1 items-center justify-center p-6">
      {children}
    </main>
  );
}
