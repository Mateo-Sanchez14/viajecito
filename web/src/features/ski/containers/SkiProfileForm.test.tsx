import { fireEvent, screen, waitFor } from "@testing-library/react";
import { HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { resetCsrfToken } from "@/shared/api/csrf";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR";
import { csrfHandler, http, skiProfileHandler } from "../test/handlers";
import { makeProfile } from "../test/fixtures";
import { SkiProfileForm } from "./SkiProfileForm";

const t = messages.ski.profile;

/** Registers a PUT handler that records the body it receives. */
function capturePut() {
  const received: unknown[] = [];
  server.use(
    csrfHandler,
    http.put("/api/me/ski_profile", async ({ request }) => {
      const body = await request.json();
      received.push(body);
      return HttpResponse.json(makeProfile(body as never));
    }),
  );
  return received;
}

async function setup(profile = makeProfile()) {
  server.use(skiProfileHandler(profile));
  renderWithProviders(<SkiProfileForm />);
  await screen.findByLabelText(t.discipline);
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const save = () => fireEvent.click(screen.getByRole("button", { name: t.save }));

describe("SkiProfileForm", () => {
  afterEach(() => resetCsrfToken());

  it("loads the saved profile, with sharing off and the reason for sizes explained", async () => {
    await setup(makeProfile({ discipline: "snowboard", level: "advanced", boot_size_eu: 42.5, height_cm: 178 }));

    expect(screen.getByLabelText(t.discipline)).toHaveValue("snowboard");
    expect(screen.getByLabelText(t.level)).toHaveValue("advanced");
    expect(screen.getByLabelText(t.boot)).toHaveValue(42.5);
    expect(screen.getByLabelText(t.height)).toHaveValue(178);
    expect(screen.getByLabelText(t.share)).not.toBeChecked();
    expect(screen.getByText(t.sizesHelp)).toBeInTheDocument();
  });

  it("offers every discipline and level with its es-AR label", async () => {
    await setup();

    expect(screen.getByRole("option", { name: t.disciplines.both })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: t.levels.first_time })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: t.levels.expert })).toBeInTheDocument();
  });

  it.each([
    ["boot", t.boot, "29.5", t.errors.boot],
    ["boot", t.boot, "50.5", t.errors.boot],
    ["boot", t.boot, "42.3", t.errors.boot],
    ["height", t.height, "99", t.errors.height],
    ["height", t.height, "231", t.errors.height],
    ["weight", t.weight, "24", t.errors.weight],
    ["weight", t.weight, "201", t.errors.weight],
  ])("rejects an out-of-range %s (%s = %s) without calling the api", async (_field, label, value, message) => {
    const received = capturePut();
    await setup();

    type(label, value);
    save();

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(received).toHaveLength(0);
  });

  it("accepts the range limits and empty sizes", async () => {
    const received = capturePut();
    await setup();

    type(t.boot, "30");
    type(t.height, "230");
    type(t.weight, "25");
    save();

    await waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]).toMatchObject({ boot_size_eu: 30, height_cm: 230, weight_kg: 25 });
  });

  it("saves the profile with the consent toggle and shows it was saved", async () => {
    const received = capturePut();
    await setup();

    fireEvent.change(screen.getByLabelText(t.discipline), { target: { value: "both" } });
    fireEvent.change(screen.getByLabelText(t.level), { target: { value: "expert" } });
    fireEvent.click(screen.getByLabelText(t.ownsGear));
    type(t.boot, "42.5");
    fireEvent.click(screen.getByLabelText(t.share));
    save();

    await waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]).toEqual({
      discipline: "both",
      level: "expert",
      owns_gear: true,
      boot_size_eu: 42.5,
      height_cm: null,
      weight_kg: null,
      share_sizes_with_trip: true,
    });
    expect(await screen.findByText(t.saved)).toBeInTheDocument();
  });

  it("shows an error when the api refuses", async () => {
    server.use(
      csrfHandler,
      http.put("/api/me/ski_profile", ({ response }) =>
        response(400).json({ code: "invalid_request", message: "x" }),
      ),
    );
    await setup();

    save();

    expect(await screen.findByRole("alert")).toHaveTextContent(messages.ski.errors.generic);
  });
});
