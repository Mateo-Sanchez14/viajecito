import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http as rawHttp } from "msw";
import { createOpenApiHttp } from "openapi-msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MeProvider } from "@/features/auth/MeProvider";
import { resetCsrfToken } from "@/shared/api/csrf";
import type { paths } from "@/shared/api/schema";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR";
import { TRIP_ID, makeMe, makeTrip } from "../fixtures";
import { TripProvider } from "../TripProvider";
import { CoverControl } from "./CoverControl";

const downscale = vi.hoisted(() => vi.fn());
vi.mock("../lib/downscaleImage", () => ({ downscaleImage: downscale }));

const http = createOpenApiHttp<paths>({ baseUrl: globalThis.location.origin });
const csrf = http.get("/api/auth/csrf", ({ response }) => response(200).json({ csrf_token: "tok" }));
const COVER_URL = `*/api/trips/${TRIP_ID}/cover`;
const t = messages.trips.cover;

const withCover = () => makeTrip({ has_cover: true, cover_version: 1 });

function setup(trip = makeTrip()) {
  const view = renderWithProviders(
    <MeProvider me={makeMe()}>
      <TripProvider trip={trip}>
        <CoverControl />
      </TripProvider>
    </MeProvider>,
  );
  const input = view.container.querySelector<HTMLInputElement>("input[type='file']")!;
  return { ...view, input };
}

function pick(input: HTMLInputElement, file = new File(["x"], "photo.jpg", { type: "image/jpeg" })) {
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

function acceptUploads() {
  const sent: (string | null)[] = [];
  server.use(
    csrf,
    rawHttp.post(COVER_URL, ({ request }) => {
      sent.push(request.headers.get("x-csrftoken"));
      return HttpResponse.json(makeTrip({ has_cover: true, cover_version: 1 }));
    }),
  );
  return sent;
}

function rejectUploads(status: number, code: string) {
  server.use(csrf, rawHttp.post(COVER_URL, () => HttpResponse.json({ code, message: "dev text" }, { status })));
}

afterEach(() => {
  resetCsrfToken();
  downscale.mockReset();
  downscale.mockResolvedValue(new Blob(["small"], { type: "image/webp" }));
});
downscale.mockResolvedValue(new Blob(["small"], { type: "image/webp" }));

describe("CoverControl without a cover", () => {
  it("offers one labelled button that is a real, keyboard-reachable button", () => {
    setup();

    const button = screen.getByRole("button", { name: t.add });
    expect(button).toHaveAttribute("type", "button");
    expect(button).not.toBeDisabled();
    expect(button.tabIndex).toBeGreaterThanOrEqual(0);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is the tour's cover anchor without changing its role or name", () => {
    setup();

    const button = screen.getByRole("button", { name: t.add });
    expect(button).toHaveAttribute("data-tour", "cover");
  });

  it("only accepts images and opens the file picker from the button", () => {
    const { input } = setup();
    const click = vi.spyOn(input, "click");

    expect(input).toHaveAttribute("accept", "image/*");
    fireEvent.click(screen.getByRole("button", { name: t.add }));

    expect(click).toHaveBeenCalledOnce();
  });

  it("downscales the pick, uploads it with the CSRF header and then offers to change it", async () => {
    const sent = acceptUploads();
    const { input } = setup();

    const file = pick(input);

    await waitFor(() => expect(screen.getByRole("button", { name: t.change })).toBeInTheDocument());
    expect(downscale).toHaveBeenCalledWith(file);
    expect(sent).toEqual(["tok"]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("disables the button and announces the upload while it is in flight", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      csrf,
      rawHttp.post(COVER_URL, async () => {
        await gate;
        return HttpResponse.json(makeTrip({ has_cover: true, cover_version: 1 }));
      }),
    );
    const { input } = setup();

    pick(input);

    const button = screen.getByRole("button", { name: t.add });
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent(t.uploading);
    release();
    await waitFor(() => expect(screen.getByRole("status")).toBeEmptyDOMElement());
  });

  it.each([
    [413, "file_too_large"],
    [413, "image_too_large"],
    [415, "unsupported_image"],
    [400, "file_required"],
  ] as const)("shows a mapped message for %i %s and never the developer text", async (status, code) => {
    rejectUploads(status, code);
    const { input } = setup();

    pick(input);

    const alert = await screen.findByRole("alert");
    const expected = code === "file_required" ? t.errors.failed : t.errors[code];
    expect(alert).toHaveTextContent(expected);
    expect(alert).not.toHaveTextContent("dev text");
    expect(screen.getByRole("button", { name: t.add })).toBeInTheDocument();
  });

  it("keeps the previous cover when an upload is rejected", async () => {
    rejectUploads(415, "unsupported_image");
    const { input } = setup(withCover());

    pick(input);

    expect(await screen.findByRole("alert")).toHaveTextContent(t.errors.unsupported_image);
    expect(screen.getByRole("button", { name: t.change })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.add })).not.toBeInTheDocument();
  });

  it("shows the generic network error when offline and leaves the trip unchanged", async () => {
    server.use(csrf, rawHttp.post(COVER_URL, () => HttpResponse.error()));
    const { input } = setup();

    pick(input);

    expect(await screen.findByRole("alert")).toHaveTextContent(t.errors.network_error);
    expect(screen.getByRole("button", { name: t.add })).toBeEnabled();
  });

  it("shows the file_too_large copy when the downscale step refuses the file", async () => {
    const { ApiError } = await import("@/shared/api/errors");
    downscale.mockRejectedValueOnce(new ApiError("file_too_large", 0));
    const { input } = setup();

    pick(input);

    expect(await screen.findByRole("alert")).toHaveTextContent(t.errors.file_too_large);
  });

  it("clears the previous error when a new pick starts", async () => {
    rejectUploads(415, "unsupported_image");
    const { input } = setup();
    pick(input);
    await screen.findByRole("alert");

    acceptUploads();
    pick(input);

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("does nothing when the picker is dismissed without a file", () => {
    const { input } = setup();

    fireEvent.change(input, { target: { files: [] } });

    expect(downscale).not.toHaveBeenCalled();
  });
});

describe("CoverControl with a cover", () => {
  function deletes() {
    const calls: (string | null)[] = [];
    server.use(
      csrf,
      http.delete("/api/trips/{trip_id}/cover", ({ request, response }) => {
        calls.push(request.headers.get("x-csrftoken"));
        return response(200).json(makeTrip({ has_cover: false, cover_version: 2 }));
      }),
    );
    return calls;
  }

  it("opens a sheet with change and remove instead of the file picker", () => {
    const { input } = setup(withCover());
    const click = vi.spyOn(input, "click");

    fireEvent.click(screen.getByRole("button", { name: t.change }));

    const sheet = screen.getByRole("dialog", { name: t.sheetTitle });
    expect(within(sheet).getByRole("button", { name: t.choose })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: t.remove })).toBeInTheDocument();
    expect(click).not.toHaveBeenCalled();
  });

  it("closes the sheet and opens the picker to choose another photo", async () => {
    const { input } = setup(withCover());
    const click = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: t.change }));

    fireEvent.click(screen.getByRole("button", { name: t.choose }));

    expect(click).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("button", { name: t.choose })).not.toBeInTheDocument());
  });

  it("asks for confirmation before removing and sends nothing until confirmed", async () => {
    const calls = deletes();
    setup(withCover());
    fireEvent.click(screen.getByRole("button", { name: t.change }));

    fireEvent.click(screen.getByRole("button", { name: t.remove }));

    const confirm = await screen.findByRole("dialog", { name: t.confirmTitle });
    expect(within(confirm).getByText(t.confirmDescription)).toBeInTheDocument();
    expect(calls).toEqual([]);

    fireEvent.click(within(confirm).getByRole("button", { name: t.confirmRemove }));

    await waitFor(() => expect(screen.getByRole("button", { name: t.add })).toBeInTheDocument());
    expect(calls).toEqual(["tok"]);
  });

  it("keeps the cover and sends nothing when the confirmation is cancelled", async () => {
    const calls = deletes();
    setup(withCover());
    fireEvent.click(screen.getByRole("button", { name: t.change }));
    fireEvent.click(screen.getByRole("button", { name: t.remove }));

    fireEvent.click(within(await screen.findByRole("dialog", { name: t.confirmTitle })).getByRole("button", { name: t.cancel }));

    expect(calls).toEqual([]);
    expect(screen.getByRole("button", { name: t.change })).toBeInTheDocument();
  });

  it("says so when the removal fails and keeps the cover", async () => {
    server.use(
      csrf,
      http.delete("/api/trips/{trip_id}/cover", ({ response }) =>
        response(404).json({ code: "not_found", message: "x" }),
      ),
    );
    setup(withCover());
    fireEvent.click(screen.getByRole("button", { name: t.change }));
    fireEvent.click(screen.getByRole("button", { name: t.remove }));

    fireEvent.click(within(await screen.findByRole("dialog", { name: t.confirmTitle })).getByRole("button", { name: t.confirmRemove }));

    expect(await screen.findByRole("alert")).toHaveTextContent(t.errors.failed);
    expect(screen.getByRole("button", { name: t.change })).toBeInTheDocument();
  });
});
