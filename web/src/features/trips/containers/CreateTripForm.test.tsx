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

describe("CreateTripForm", () => {
  beforeEach(() => push.mockReset());
  afterEach(() => resetCsrfToken());

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

  it("rejects a currency that is not a 3-letter code", () => {
    renderWithProviders(<CreateTripForm crewId={CREW_ID} />);
    fill(t.name, "Bariloche");
    fill(t.currency, "DOLARES");

    submit();

    expect(screen.getByText(t.errors.currencyInvalid)).toBeInTheDocument();
  });

  it("creates the trip and navigates to it", async () => {
    let body: unknown;
    server.use(
      http.get("/api/auth/csrf", ({ response }) => response(200).json({ csrf_token: "tok" })),
      http.post("/api/crews/{crew_id}/trips", async ({ request, response }) => {
        body = await request.json();
        return response(201).json(makeTrip());
      }),
    );
    renderWithProviders(<CreateTripForm crewId={CREW_ID} />);
    fill(t.name, "  Bariloche 2027 ");
    fill(t.startOn, "2027-07-01");
    fill(t.endOn, "2027-07-08");
    fill(t.destination, "Bariloche");
    fill(t.currency, "ars");

    submit();

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/crews/${CREW_ID}/trips/${TRIP_ID}`));
    expect(body).toEqual({
      name: "Bariloche 2027",
      type: "generic",
      start_on: "2027-07-01",
      end_on: "2027-07-08",
      destination_label: "Bariloche",
      currency: "ARS",
    });
  });

  it("submits the selected ski trip type", async () => {
    let body: unknown;
    server.use(
      http.get("/api/auth/csrf", ({ response }) => response(200).json({ csrf_token: "tok" })),
      http.post("/api/crews/{crew_id}/trips", async ({ request, response }) => {
        body = await request.json();
        return response(201).json(makeTrip({ type: "ski" }));
      }),
    );
    renderWithProviders(<CreateTripForm crewId={CREW_ID} />);
    fill(t.name, "Ski trip");
    fill(t.type, "ski");

    submit();

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/crews/${CREW_ID}/trips/${TRIP_ID}`));
    expect(body).toEqual({
      name: "Ski trip",
      type: "ski",
      start_on: null,
      end_on: null,
      destination_label: "",
      currency: "USD",
    });
  });

  it("sends explicit nulls, an empty destination and the USD default when left blank", async () => {
    let body: unknown;
    server.use(
      http.get("/api/auth/csrf", ({ response }) => response(200).json({ csrf_token: "tok" })),
      http.post("/api/crews/{crew_id}/trips", async ({ request, response }) => {
        body = await request.json();
        return response(201).json(makeTrip());
      }),
    );
    renderWithProviders(<CreateTripForm crewId={CREW_ID} />);
    fill(t.name, "Solo nombre");
    fill(t.currency, "");

    submit();

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(body).toEqual({
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
