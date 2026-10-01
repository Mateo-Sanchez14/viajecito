import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import messages from "../../../../messages/es-AR";
import { makePreview, makeSummary, makeTally, PROPOSAL_ID } from "../test/handlers";
import { ProposalCard } from "./ProposalCard";

const t = messages.proposals;
const money = (amount: number, currency: string) =>
  // Intl uses a no-break space; Testing Library collapses it in the DOM text.
  new Intl.NumberFormat("es-AR", { style: "currency", currency }).format(amount).replace(/\s/g, " ");

function setup(overrides: Parameters<typeof makeSummary>[0] = {}, voteSlot?: React.ReactNode) {
  const proposal = makeSummary(overrides);
  const view = renderWithProviders(<ProposalCard proposal={proposal} href="/p/1" voteSlot={voteSlot} />);
  return { proposal, ...view };
}

describe("ProposalCard", () => {
  it("links the title to the detail and shows site, category and status as text", () => {
    setup();

    expect(screen.getByRole("link", { name: "Llao Llao Resort" })).toHaveAttribute("href", "/p/1");
    expect(screen.getByText("Booking.com")).toBeInTheDocument();
    expect(screen.getByText(t.category.lodging)).toBeInTheDocument();
    expect(screen.getByText(t.status.proposed)).toBeInTheDocument();
  });

  it("shows a decorative thumbnail from the authorized endpoint when the preview has one", () => {
    const { container } = setup();

    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", `/api/proposals/${PROPOSAL_ID}/thumbnail`);
    expect(img).toHaveAttribute("alt", "");
  });

  it("renders no image when the preview has no thumbnail", () => {
    const { container } = setup({ preview: makePreview({ has_thumbnail: false }) });

    expect(container.querySelector("img")).toBeNull();
  });

  it("pending: skeleton thumbnail, the URL and the searching copy", () => {
    const { container } = setup({
      preview: makePreview({ fetch_status: "pending", has_thumbnail: false, site_name: "", title: "" }),
      title: "hotel llao llao",
    });

    expect(container.querySelector('[data-thumbnail="pending"]')).not.toBeNull();
    expect(screen.getByText("https://www.booking.com/hotel/ar/llao-llao.html")).toBeInTheDocument();
    expect(screen.getByText(t.preview.pending)).toBeInTheDocument();
  });

  it.each(["blocked", "partial", "failed"] as const)(
    "%s: keeps the slug title and site, and says the page could not be read",
    (fetch_status) => {
      setup({ title: "Llao Llao Hotel", preview: makePreview({ fetch_status, has_thumbnail: false }) });

      expect(screen.getByRole("link", { name: "Llao Llao Hotel" })).toBeInTheDocument();
      expect(screen.getByText("Booking.com")).toBeInTheDocument();
      expect(screen.getByText(t.preview.blocked)).toBeInTheDocument();
    },
  );

  it("works without any preview (manual proposal)", () => {
    setup({ preview: null, title: "Cena en el centro", category: "food" });

    expect(screen.getByRole("link", { name: "Cena en el centro" })).toBeInTheDocument();
    expect(screen.queryByText(t.preview.pending)).not.toBeInTheDocument();
    expect(screen.queryByText(t.preview.blocked)).not.toBeInTheDocument();
  });

  it("chosen: shows the badge text", () => {
    setup({ status: "chosen" });

    expect(screen.getByText(t.status.chosen)).toBeInTheDocument();
  });

  it("booked: shows the badge and the booking reference", () => {
    setup({ status: "booked", booking_ref: "ABC123" });

    expect(screen.getByText(t.status.booked)).toBeInTheDocument();
    expect(screen.getByText(t.card.booking.replace("{ref}", "ABC123"))).toBeInTheDocument();
  });

  it("discarded: muted with a struck-through title, still labelled by text", () => {
    const { container } = setup({ status: "discarded" });

    expect(screen.getByRole("heading", { name: "Llao Llao Resort" }).className).toContain("line-through");
    expect(container.querySelector("article")?.className).toContain("opacity-60");
    expect(screen.getByText(t.status.discarded)).toBeInTheDocument();
  });

  it("shows the price with its basis and the vote summary", () => {
    setup({ est_price: "1500.00", currency: "USD", price_basis: "per_night", tally: makeTally({ up: 3, down: 1 }) });

    expect(screen.getByText(`${money(1500, "USD")} ${t.price.perNight}`)).toBeInTheDocument();
    expect(screen.getByText(t.vote.count.replace("{up}", "3").replace("{down}", "1"))).toBeInTheDocument();
  });

  it("shows the author and the comment count", () => {
    setup({ comment_count: 2 });

    expect(screen.getByText(t.card.by.replace("{author}", "Mateo"))).toBeInTheDocument();
    expect(screen.getByText("2 comentarios")).toBeInTheDocument();
  });

  it("renders the vote slot", () => {
    const { container } = setup({}, <button type="button">voto</button>);

    expect(within(container).getByRole("button", { name: "voto" })).toBeInTheDocument();
  });
});
