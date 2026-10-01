import { fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR";
import { installFakeCaches, removeFakeCaches } from "../test/fakeCaches";
import { OfflineDocumentsCard } from "./OfflineDocumentsCard";

const t = messages.pwa.offlineDocs;
const TRIP = "22222222-2222-4222-8222-222222222222";
const docs = [
  { id: "d1", title: "Pasaje de ida", download_path: "/api/documents/d1/file", mime: "application/pdf" },
  { id: "d2", title: "Seguro", download_path: "/api/documents/d2/file", mime: "application/pdf" },
];

const listDocs = (body: Record<string, unknown> | unknown[] = docs, status = 200) =>
  http.get(`${globalThis.location.origin}/api/trips/${TRIP}/documents`, () => HttpResponse.json(body, { status }));
const fileBytes = (id: string, status = 200) =>
  http.get(`${globalThis.location.origin}/api/documents/${id}/file`, () =>
    status === 200 ? new HttpResponse("pdf-bytes", { headers: { "Content-Type": "application/pdf" } }) : new HttpResponse(null, { status }),
  );

describe("OfflineDocumentsCard", () => {
  let fake: ReturnType<typeof installFakeCaches>;
  beforeEach(() => {
    fake = installFakeCaches();
  });
  afterEach(() => removeFakeCaches());

  it("lists the downloadable documents with a save button each", async () => {
    server.use(listDocs());
    renderWithProviders(<OfflineDocumentsCard tripId={TRIP} crewId="c" />);

    expect(await screen.findByText("Pasaje de ida")).toBeInTheDocument();
    expect(screen.getByText("Seguro")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: new RegExp(t.save) })).toHaveLength(2);
  });

  it("saves a document into the opt-in cache on request", async () => {
    server.use(listDocs(), fileBytes("d1"));
    renderWithProviders(<OfflineDocumentsCard tripId={TRIP} crewId="c" />);

    fireEvent.click((await screen.findAllByRole("button", { name: new RegExp(t.save) }))[0]);

    expect(await screen.findByText(t.saved)).toBeInTheDocument();
    const store = fake.stores.get("documents-files-v1");
    expect(store?.has("/api/documents/d1/file")).toBe(true);
    expect(store?.has("/api/documents/d2/file")).toBe(false);
  });

  it("shows a saved document as available offline and lets the user remove it", async () => {
    const cache = await fake.open("documents-files-v1");
    await cache.put("/api/documents/d1/file", new Response("x"));
    server.use(listDocs());
    renderWithProviders(<OfflineDocumentsCard tripId={TRIP} crewId="c" />);

    expect(await screen.findByText(t.saved)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(t.remove) }));

    await waitFor(() => expect(fake.stores.get("documents-files-v1")?.has("/api/documents/d1/file")).toBe(false));
  });

  it("does not store a failed download", async () => {
    server.use(listDocs(), fileBytes("d1", 500));
    renderWithProviders(<OfflineDocumentsCard tripId={TRIP} crewId="c" />);

    fireEvent.click((await screen.findAllByRole("button", { name: new RegExp(t.save) }))[0]);

    expect(await screen.findByRole("alert")).toHaveTextContent(t.error);
    expect(fake.stores.get("documents-files-v1")?.has("/api/documents/d1/file") ?? false).toBe(false);
  });

  it("refuses to cache anything that is not a document file path", async () => {
    server.use(listDocs([{ id: "x", title: "Raro", download_path: "/api/me" }]));
    renderWithProviders(<OfflineDocumentsCard tripId={TRIP} crewId="c" />);

    expect(await screen.findByText(t.empty)).toBeInTheDocument();
  });

  it("says so when there is nothing to save and when the list cannot load", async () => {
    server.use(listDocs([]));
    const first = renderWithProviders(<OfflineDocumentsCard tripId={TRIP} crewId="c" />);
    expect(await screen.findByText(t.empty)).toBeInTheDocument();
    first.unmount();

    server.use(listDocs({ code: "not_found" }, 404));
    renderWithProviders(<OfflineDocumentsCard tripId={TRIP} crewId="c" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(t.loadError);
  });
});
