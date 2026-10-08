import { fireEvent, screen, waitFor } from "@testing-library/react";
import { createOpenApiHttp } from "openapi-msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCsrfToken } from "@/shared/api/csrf";
import type { paths } from "@/shared/api/schema";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR";
import { CREW_ID, TRIP_ID, makeTrip } from "../fixtures";
import { CreateTripForm } from "./CreateTripForm";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const http = createOpenApiHttp<paths>({ baseUrl: globalThis.location.origin });
const t = messages.trips.create;

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
const submit = () => fireEvent.click(screen.getByRole("button", { name: t.submit }));
const more = () => screen.getByText(t.more).closest("details") as HTMLDetailsElement;

function captureCreate(trip = makeTrip()) {
  const captured: { body?: unknown } = {};
  server.use(
    http.get("/api/auth/csrf", ({ response }) => response(200).json({ csrf_token: "tok" })),
    http.post("/api/crews/{crew_id}/trips", async ({ request, response }) => {
      captured.body = await request.json();
      return response(201).json(trip);
    }),
  );
  return captured;
}

describe("CreateTripForm", () => {
  beforeEach(() => push.mockReset());
  afterEach(() => resetCsrfToken());

  it("asks where to first and keeps type and currency behind 'more options'", () => {
    renderWithProviders(<CreateTripForm crewId={CREW_ID} />);

    const labels = screen.getAllByRole("textbox").map((input) => input.getAttribute("id"));
    expect(screen.getAllByRole("textbox")[0]).toHaveAccessibleName(t.destination);
    expect(labels.length).toBeGreaterThanOrEqual(2);
    expect(more().open).toBe(false);
    expect(more()).toContainElement(screen.getByLabelText(t.type));
    expect(more()).toContainElement(screen.getByLabelText(t.currency));
  });

  it("requires a name and does not call the api", () => {
    renderWithProviders(<CreateTripForm crewId={CREW_ID} />);

    submit();

    expect(screen.getByText(t.errors.nameRequired)).toBeInTheDocument();
    expect(screen.getByLabelText(t.name)).toBeInvalid();
    expect(push).not.toHaveBeenCalled();
  });

  it("rejects an end date before the start date", () => {
    renderWithProviders(<CreateTripForm crewId={CREW_ID} />);
    fill(t.name, "Bariloche");
    fill(t.startOn, "2027-07-08");
    fill(t.endOn, "2027-07-01");

    submit();

    expect(screen.getByText(t.errors.endBeforeStart)).toBeInTheDocument();
  });

  it("rejects a currency that is not a 3-letter code, and opens 'more options' to show why", () => {
    renderWithProviders(<CreateTripForm crewId={CREW_ID} />);
    fill(t.name, "Bariloche");
    fill(t.currency, "DOLARES");

    submit();

    expect(screen.getByText(t.errors.currencyInvalid)).toBeInTheDocument();
    expect(more().open).toBe(true);
  });

  it("creates the trip and navigates to it", async () => {
    const captured = captureCreate();
    renderWithProviders(<CreateTripForm crewId={CREW_ID} />);
    fill(t.destination, "Bariloche");
    fill(t.name, "  Bariloche 2027 ");
    fill(t.startOn, "2027-07-01");
    fill(t.endOn, "2027-07-08");
    fireEvent.click(screen.getByText(t.more));
    fill(t.currency, "ars");

    submit();

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/crews/${CREW_ID}/trips/${TRIP_ID}`));
    expect(captured.body).toEqual({
      name: "Bariloche 2027",
      type: "generic",
      start_on: "2027-07-01",
      end_on: "2027-07-08",
      destination_label: "Bariloche",
      currency: "ARS",
    });
  });

  it("submits the selected ski trip type", async () => {
    const captured = captureCreate(makeTrip({ type: "ski" }));
    renderWithProviders(<CreateTripForm crewId={CREW_ID} />);
    fill(t.name, "Ski trip");
    fill(t.type, "ski");

    submit();

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(captured.body).toEqual({
      name: "Ski trip",
      type: "ski",
      start_on: null,
      end_on: null,
      destination_label: "",
      currency: "USD",
    });
  });

  it("sends explicit nulls, an empty destination and the USD default when left blank", async () => {
    const captured = captureCreate();
    renderWithProviders(<CreateTripForm crewId={CREW_ID} />);
    fill(t.name, "Solo nombre");
    fill(t.currency, "");

    submit();

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(captured.body).toEqual({
      name: "Solo nombre",
      type: "generic",
      start_on: null,
      end_on: null,
      destination_label: "",
      currency: "USD",
    });
  });

  it("offers generic and ski trip types", () => {
    renderWithProviders(<CreateTripForm crewId={CREW_ID} />);

    expect(screen.getAllByRole("option").map((o) => o.getAttribute("value"))).toEqual(["generic", "ski"]);
  });

  it("shows an error and stays put when the api fails", async () => {
    server.use(
      http.get("/api/auth/csrf", ({ response }) => response(200).json({ csrf_token: "tok" })),
      http.post("/api/crews/{crew_id}/trips", ({ response }) =>
        response(400).json({ code: "invalid_request", message: "x" }),
      ),
    );
    renderWithProviders(<CreateTripForm crewId={CREW_ID} />);
    fill(t.name, "Bariloche");

    submit();

    expect(await screen.findByText(t.errors.failed)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("CreateTripForm suggested name", () => {
  beforeEach(() => push.mockReset());
  afterEach(() => resetCsrfToken());

  const nameInput = () => screen.getByLabelText(t.name) as HTMLInputElement;

  it("starts empty and follows the destination", () => {
    renderWithProviders(<CreateTripForm crewId={CREW_ID} />);
    expect(nameInput().value).toBe("");

    fill(t.destination, "Mendoza, Argentina");

    expect(nameInput().value).toBe("Mendoza");
  });

  it("adds the month and year of the start date", () => {
    renderWithProviders(<CreateTripForm crewId={CREW_ID} />);

    fill(t.destination, "Bariloche");
    fill(t.startOn, "2027-07-01");

    expect(nameInput().value).toMatch(/^Bariloche jul\.? 2027$/);
  });

  it("stops following once the person edits the name, even if they empty it", () => {
    renderWithProviders(<CreateTripForm crewId={CREW_ID} />);
    fill(t.destination, "Bariloche");

    fill(t.name, "Finde con los pibes");
    fill(t.destination, "Pinamar");
    expect(nameInput().value).toBe("Finde con los pibes");

    fill(t.name, "");
    fill(t.destination, "Salta");
    expect(nameInput().value).toBe("");
  });

  it("submits the suggested name as is", async () => {
    const captured = captureCreate();
    renderWithProviders(<CreateTripForm crewId={CREW_ID} />);
    fill(t.destination, "Bariloche, Río Negro");

    submit();

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(captured.body).toMatchObject({ name: "Bariloche", destination_label: "Bariloche, Río Negro" });
  });
});

describe("CreateTripForm picture hint", () => {
  it("shows nothing for a destination it does not recognise", () => {
    renderWithProviders(<CreateTripForm crewId={CREW_ID} />);

    fill(t.destination, "Zzz");

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("says which picture a recognised destination gets, with its photo and a described alt", () => {
    const { container } = renderWithProviders(<CreateTripForm crewId={CREW_ID} />);

    fill(t.destination, "Mar del Plata");

    expect(screen.getByRole("status")).toHaveTextContent(t.sceneHint.replace("{scene}", t.scene.beach));
    const photo = container.querySelector<HTMLImageElement>(".create-trip-scene-image")!;
    expect(photo.getAttribute("src")).toMatch(/^\/photos\/beach-(aerial|foam)\.[0-9a-f]{10}\.640\.webp$/);
    expect(photo).toHaveAttribute("alt", messages.photos.alt[photo.dataset.photo as keyof typeof messages.photos.alt]);
    expect(photo).toHaveAttribute("loading", "lazy");
  });

  it.each([
    ["Lago Puelo", "lake", "lake-patagonia"],
    ["Mendoza", "vineyard", "vineyard"],
    ["Salta", "desert", "desert"],
    ["Buenos Aires", "city", "city-"],
  ] as const)("shows %s with its own %s photo, not a borrowed scene", (destination, kind, photoId) => {
    const { container } = renderWithProviders(<CreateTripForm crewId={CREW_ID} />);

    fill(t.destination, destination);

    expect(screen.getByRole("status")).toHaveTextContent(t.scene[kind]);
    expect(container.querySelector<HTMLImageElement>(".create-trip-scene-image")!.dataset.photo).toContain(photoId);
  });

  it("follows the trip type: ski is always snow", () => {
    renderWithProviders(<CreateTripForm crewId={CREW_ID} />);
    fill(t.destination, "Mar del Plata");

    fill(t.type, "ski");

    expect(screen.getByRole("status")).toHaveTextContent(t.scene.snow);
  });
});
