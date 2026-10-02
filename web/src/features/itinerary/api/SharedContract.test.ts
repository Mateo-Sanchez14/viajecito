import { expect, it, vi } from "vitest";
import { server } from "@/test/server";
import { createBrowserClient } from "@/shared/api/client";
import { getDocuments } from "@/features/today/api/external";
import { documentsHandler } from "@/features/today/test/handlers";
import { itineraryHandler } from "../test/handlers";
import { getItinerary } from "./itinerary";

vi.mock("@/shared/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api/client")>();
  return { ...actual, createBrowserClient: vi.fn(actual.createBrowserClient) };
});

it("uses the shared generated client for itinerary and document reads", async () => {
  server.use(itineraryHandler(), documentsHandler);
  vi.mocked(createBrowserClient).mockClear();
  expect((await getItinerary("trip")).timezone).toBe("America/Argentina/Buenos_Aires");
  expect((await getDocuments("trip"))[0].title).toBe("Flight ticket");
  expect(createBrowserClient).toHaveBeenCalledTimes(2);
});
