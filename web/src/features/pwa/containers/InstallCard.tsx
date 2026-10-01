"use client";

import { useRegisterServiceWorker } from "../hooks/useRegisterServiceWorker";
import { InstallPrompt } from "./InstallPrompt";

/**
 * Overview card (`order: 2`): the install offer. It is also where the service worker gets
 * registered, so offline support starts as soon as the trip overview is opened.
 */
export function InstallCard(props: { tripId: string; crewId: string }) {
  void props;
  useRegisterServiceWorker();
  return <InstallPrompt />;
}
