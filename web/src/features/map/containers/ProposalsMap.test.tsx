import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen, within, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ComponentType, ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { makeSummary, makePreview } from "@/features/proposals/test/handlers";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import { CREW_ID, TRIP_ID } from "@/features/trips/fixtures";
import { mapProposalsHandler } from "../test/handlers";
import { ProposalsMap } from "./ProposalsMap";
const map = vi.hoisted(() => ({ fitBounds: vi.fn(), setView: vi.fn() }));
vi.mock("next/dynamic", async () => {
  const { lazy, Suspense } = await import("react");
  return {
    default: (
      load: () => Promise<{ default: ComponentType<Record<string, unknown>> }>,
      options: { ssr: boolean },
    ) => {
      expect(options.ssr).toBe(false);
      const Component = lazy(load);
      return (props: Record<string, unknown>) => (
        <Suspense fallback={<span>Loading</span>}>
          <Component {...props} />
        </Suspense>
      );
    },
  };
});
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="map">{children}</div>
  ),
  TileLayer: ({
    url,
    attribution,
    keepBuffer,
  }: {
    url: string;
    attribution: string;
    keepBuffer: number;
  }) => (
    <span
      data-testid="tiles"
      data-url={url}
      data-buffer={keepBuffer}
      data-attribution={attribution}
    >
      {attribution}
    </span>
  ),
  Marker: ({
    title,
    position,
    children,
    icon,
  }: {
    title: string;
    position: number[];
    children: ReactNode;
    icon: { options: { html: HTMLElement } };
  }) => (
    <div
      data-testid="marker"
      data-position={JSON.stringify(position)}
      aria-label={title}
    >
      <span>{icon.options.html.textContent}</span>
      {children}
    </div>
  ),
  Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  useMap: () => map,
}));
it("renders valid markers with category labels, status/detail popups and every proposal in its fallback", async () => {
  server.use(
    mapProposalsHandler([
      makeSummary({
        title: "Lake hotel",
        status: "booked",
        preview: makePreview({ lat: -41, lng: -71 }),
      }),
      makeSummary({
        id: "missing",
        title: "Cafe TBD",
        category: "food",
        preview: null,
      }),
      makeSummary({
        id: "zero",
        title: "Zero island",
        category: "destination",
        preview: makePreview({ lat: 0, lng: 0 }),
      }),
    ]),
  );
  renderWithProviders(<ProposalsMap tripId={TRIP_ID} crewId={CREW_ID} />);
  const list = await screen.findByRole("list", { name: "Lista de lugares" });
  expect(within(list).getAllByRole("listitem")).toHaveLength(3);
  expect(screen.getByText("1 propuesta sin ubicación")).toBeVisible();
  await waitFor(() => expect(screen.getAllByTestId("marker")).toHaveLength(2));
  const markers = screen.getAllByTestId("marker");
  expect(markers[0]).toHaveAccessibleName("Lake hotel · Alojamiento");
  expect(markers[0]).toHaveTextContent("Reservada");
  expect(
    within(markers[0]).getByRole("link", { name: "Ver propuesta" }),
  ).toHaveAttribute(
    "href",
    `/crews/${CREW_ID}/trips/${TRIP_ID}/proposals/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
  );
  expect(markers[1]).toHaveAttribute("data-position", "[0,0]");
  expect(screen.getByTestId("tiles")).toHaveAttribute(
    "data-url",
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  );
  expect(screen.getByTestId("tiles")).toHaveTextContent(
    "© OpenStreetMap contributors",
  );
  expect(screen.getByTestId("tiles")).toHaveAttribute("data-buffer", "0");
  expect(
    screen.getByTestId("tiles").getAttribute("data-attribution"),
  ).toContain("https://www.openstreetmap.org/copyright");
});
it("keeps proposals without coordinates usable without loading any tiles", async () => {
  server.use(
    mapProposalsHandler([
      makeSummary({ title: "Unknown place", preview: null }),
    ]),
  );
  renderWithProviders(<ProposalsMap tripId={TRIP_ID} crewId={CREW_ID} />);
  expect(
    await screen.findByRole("link", { name: "Unknown place" }),
  ).toBeVisible();
  expect(screen.queryByTestId("map")).not.toBeInTheDocument();
});
it("shows a useful empty state and no tile requests", async () => {
  server.use(mapProposalsHandler([]));
  renderWithProviders(<ProposalsMap tripId={TRIP_ID} crewId={CREW_ID} />);
  expect(
    await screen.findByText("Los lugares que propongan van a aparecer acá"),
  ).toBeVisible();
  expect(screen.queryByTestId("map")).not.toBeInTheDocument();
});
it("maps request failures to copy and never displays developer messages", async () => {
  server.use(
    http.get("*/api/trips/:id/proposals", () =>
      HttpResponse.json(
        { code: "not_found", message: "Private details" },
        { status: 404 },
      ),
    ),
  );
  renderWithProviders(<ProposalsMap tripId={TRIP_ID} crewId={CREW_ID} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No pudimos cargar los lugares",
  );
  expect(screen.queryByText("Private details")).not.toBeInTheDocument();
});

it("preserves map exploration when polling returns unchanged coordinates", async () => {
  server.use(
    mapProposalsHandler([
      makeSummary({ preview: makePreview({ lat: -41, lng: -71 }) }),
    ]),
  );
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { unmount } = renderWithProviders(
    <QueryClientProvider client={cache}>
      <ProposalsMap tripId={TRIP_ID} crewId={CREW_ID} />
    </QueryClientProvider>,
  );
  await screen.findByTestId("marker");
  const before = map.fitBounds.mock.calls.length;
  await act(async () => {
    await cache.invalidateQueries({ queryKey: ["proposals", TRIP_ID] });
  });
  expect(map.fitBounds.mock.calls.length).toBe(before);
  unmount();
  cache.clear();
});
