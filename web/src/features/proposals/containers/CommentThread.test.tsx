import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse } from "msw";
import { createOpenApiHttp } from "openapi-msw";
import { afterEach, describe, expect, it } from "vitest";
import { resetCsrfToken } from "@/shared/api/csrf";
import type { components, paths } from "@/shared/api/schema";
import { renderWithProviders } from "@/test/render";
import { server } from "@/test/server";
import messages from "../../../../messages/es-AR";
import { makeComment, PROPOSAL_ID } from "../test/handlers";
import { CommentThread } from "./CommentThread";

const http = createOpenApiHttp<paths>({ baseUrl: globalThis.location.origin });
const csrf = http.get("/api/auth/csrf", ({ response }) => response(200).json({ csrf_token: "tok" }));
const t = messages.proposals.comments;

type Comment = components["schemas"]["CommentOut"];

/** A tiny in-memory comment store behind MSW, like the api would be. */
function serveComments(initial: Comment[]) {
  let comments = initial;
  const calls = { posted: [] as unknown[], deleted: [] as string[] };
  server.use(
    csrf,
    http.get("/api/proposals/{proposal_id}/comments", ({ response }) => response(200).json(comments)),
    http.post("/api/proposals/{proposal_id}/comments", async ({ request, response }) => {
      const body = (await request.json()) as { body: string };
      calls.posted.push(body);
      const created = makeComment({ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", body: body.body });
      comments = [...comments, created];
      return response(201).json(created);
    }),
    http.delete("/api/comments/{comment_id}", ({ params }) => {
      calls.deleted.push(params.comment_id as string);
      comments = comments.filter((c) => c.id !== params.comment_id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return calls;
}

const setup = () => renderWithProviders(<CommentThread proposalId={PROPOSAL_ID} />);

describe("CommentThread", () => {
  afterEach(() => resetCsrfToken());

  it("lists comments in the order the api sends them, with their author", async () => {
    serveComments([
      makeComment({ id: "11111111-1111-4111-8111-111111111111", body: "primero", author: { person_id: "p1", display_name: "Lucia" }, can_delete: false }),
      makeComment({ id: "22222222-2222-4222-8222-222222222222", body: "segundo" }),
    ]);
    setup();

    const items = within(await screen.findByRole("list", { name: t.title })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Lucia");
    expect(items[0]).toHaveTextContent("primero");
    expect(items[1]).toHaveTextContent("segundo");
  });

  it("shows an empty state when there are no comments", async () => {
    serveComments([]);
    setup();

    expect(await screen.findByText(t.empty)).toBeInTheDocument();
  });

  it("marks comments that came from WhatsApp", async () => {
    serveComments([makeComment({ source: "whatsapp" })]);
    setup();

    expect(await screen.findByText(t.viaWhatsapp)).toBeInTheDocument();
  });

  it("adds a comment, clears the field and shows the new comment", async () => {
    const calls = serveComments([]);
    setup();
    await screen.findByText(t.empty);

    fireEvent.change(screen.getByLabelText(t.label), { target: { value: "  vamos!  " } });
    fireEvent.click(screen.getByRole("button", { name: t.submit }));

    expect(await screen.findByText("vamos!")).toBeInTheDocument();
    expect(calls.posted).toEqual([{ body: "vamos!" }]);
    expect(screen.getByLabelText(t.label)).toHaveValue("");
  });

  it("does not submit an empty or blank comment", async () => {
    serveComments([]);
    setup();
    await screen.findByText(t.empty);

    const submit = screen.getByRole("button", { name: t.submit });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(t.label), { target: { value: "   " } });
    expect(submit).toBeDisabled();
  });

  it("counts characters and caps the field at 2000", async () => {
    serveComments([]);
    setup();
    await screen.findByText(t.empty);

    const field = screen.getByLabelText(t.label);
    expect(screen.getByText(t.counter.replace("{count}", "0").replace("{max}", "2000"))).toBeInTheDocument();
    fireEvent.change(field, { target: { value: "hola" } });

    expect(screen.getByText(t.counter.replace("{count}", "4").replace("{max}", "2000"))).toBeInTheDocument();
    expect(field).toHaveAttribute("maxlength", "2000");
  });

  it("offers delete only on comments the viewer can delete, and deletes", async () => {
    const calls = serveComments([
      makeComment({ id: "11111111-1111-4111-8111-111111111111", body: "ajeno", can_delete: false }),
      makeComment({ id: "22222222-2222-4222-8222-222222222222", body: "mio", can_delete: true }),
    ]);
    setup();
    await screen.findByText("mio");

    expect(screen.getAllByRole("button", { name: t.delete })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: t.delete }));

    await waitFor(() => expect(screen.queryByText("mio")).not.toBeInTheDocument());
    expect(calls.deleted).toEqual(["22222222-2222-4222-8222-222222222222"]);
    expect(screen.getByText("ajeno")).toBeInTheDocument();
  });

  it("shows the api's reason when a comment cannot be saved", async () => {
    serveComments([]);
    server.use(
      http.post("/api/proposals/{proposal_id}/comments", ({ response }) =>
        response(400).json({ code: "invalid_request", message: "x" }),
      ),
    );
    setup();
    await screen.findByText(t.empty);

    fireEvent.change(screen.getByLabelText(t.label), { target: { value: "hola" } });
    fireEvent.click(screen.getByRole("button", { name: t.submit }));

    expect(await screen.findByRole("alert")).toHaveTextContent(messages.proposals.errors.invalid_request);
    expect(screen.getByLabelText(t.label)).toHaveValue("hola");
  });

  it("says when the thread cannot load", async () => {
    server.use(
      http.get("/api/proposals/{proposal_id}/comments", () =>
        HttpResponse.json({ code: "boom", message: "x" }, { status: 500 }),
      ),
    );
    setup();

    expect(await screen.findByRole("alert")).toHaveTextContent(t.failed);
  });
});
