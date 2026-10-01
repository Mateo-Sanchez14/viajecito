import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import messages from "../../../../messages/es-AR";
import { OTHER_PERSON_ID, THIRD_PERSON_ID, makeAvailability, makeDecision, makePersonRef, makeWindow } from "../test/handlers";
import { BestWindowsPanel } from "./BestWindowsPanel";
import { CrewHeatmap } from "./CrewHeatmap";
import { DecisionOutcome } from "./DecisionOutcome";
import { NonResponders } from "./NonResponders";

const m = messages.dates;
const longDay = (iso: string) =>
  new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );

describe("BestWindowsPanel", () => {
  it("lists the leading windows with their metrics", () => {
    renderWithProviders(
      <BestWindowsPanel
        hasData
        windows={[
          makeWindow(),
          makeWindow({
            start: "2027-07-05",
            end: "2027-07-11",
            full_people: [OTHER_PERSON_ID],
            blocked_people: [THIRD_PERSON_ID, OTHER_PERSON_ID],
            weekend_days: 1,
            missing_people: [],
          }),
        ]}
        onClose={() => {}}
      />,
    );

    const items = within(screen.getByRole("list", { name: m.best.title })).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(m.best.line.replace("{start}", "12 jul").replace("{end}", "18 jul").replace("{full}", "2"));
    expect(items[0]).toHaveTextContent(m.best.none);
    expect(items[0]).toHaveTextContent(m.best.days.replace("{count}", "7"));
    expect(items[0]).toHaveTextContent(m.best.weekend.replace("{count}", "2"));
    expect(items[0]).toHaveTextContent(m.best.missing.replace("{count}", "1"));
    expect(items[1]).toHaveTextContent(m.best.blocked.replace("{count}", "2"));
  });

  it("closes with the window of the button that was pressed", () => {
    const onClose = vi.fn();
    const second = makeWindow({ start: "2027-07-05", end: "2027-07-11" });
    renderWithProviders(<BestWindowsPanel hasData windows={[makeWindow(), second]} onClose={onClose} />);

    fireEvent.click(screen.getAllByRole("button", { name: new RegExp(m.best.close) })[1]);

    expect(onClose).toHaveBeenCalledWith(second);
  });

  it("explains that options appear once people answer, with no close button", () => {
    renderWithProviders(<BestWindowsPanel hasData={false} windows={[makeWindow()]} onClose={() => {}} />);

    expect(screen.getByText(m.best.noData)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("disables closing while a close is in flight", () => {
    renderWithProviders(<BestWindowsPanel hasData windows={[makeWindow()]} onClose={() => {}} disabled />);

    expect(screen.getByRole("button", { name: new RegExp(m.best.close) })).toBeDisabled();
  });
});

describe("NonResponders", () => {
  it("lists who has not answered", () => {
    renderWithProviders(
      <NonResponders people={[makePersonRef({ display_name: "Fede" }), makePersonRef({ person_id: OTHER_PERSON_ID, display_name: "Lucia" })]} />,
    );

    const list = screen.getByRole("list", { name: m.missing.title });
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Fede", "Lucia"]);
  });

  it("says everybody answered when nobody is missing", () => {
    renderWithProviders(<NonResponders people={[]} />);

    expect(screen.getByText(m.missing.none)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});

describe("CrewHeatmap", () => {
  const { dates, people } = makeAvailability();
  const others = people.slice(1); // Lucia (12 yes, 13 maybe, 14 no) and Fede (nothing)

  it("counts yes and maybe answers per day", () => {
    renderWithProviders(<CrewHeatmap dates={dates} people={others} />);

    const label = (day: string, yes: number, maybe: number) =>
      m.heatmap.cellLabel.replace("{day}", day).replace("{yes}", String(yes)).replace("{maybe}", String(maybe));
    expect(screen.getByRole("button", { name: label(longDay("2027-07-12"), 1, 0) })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: label(longDay("2027-07-13"), 0, 1) })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: label(longDay("2027-07-14"), 0, 0) })).toBeInTheDocument();
  });

  it("shows who answered what for the tapped day", () => {
    renderWithProviders(<CrewHeatmap dates={dates} people={others} />);

    fireEvent.click(screen.getByRole("button", { name: /lun, 12 de julio/ }));

    const detail = screen.getByRole("region", { name: m.heatmap.detailTitle.replace("{day}", "lun, 12 de julio") });
    expect(detail).toHaveTextContent(m.heatmap.yes);
    expect(detail).toHaveTextContent("Lucia Gomez");
  });

  it("says so when nobody marked the tapped day, and a second tap closes the detail", () => {
    renderWithProviders(<CrewHeatmap dates={dates} people={others} />);
    const button = screen.getByRole("button", { name: /vie, 9 de julio/ });

    fireEvent.click(button);
    expect(screen.getByText(m.heatmap.nobody)).toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});

describe("DecisionOutcome", () => {
  const closed = makeDecision({
    status: "closed",
    outcome_start: "2027-07-12",
    outcome_end: "2027-07-18",
    closed_by: makePersonRef({ display_name: "Lucia Gomez" }),
  });

  it("shows the closed dates and who closed them", () => {
    renderWithProviders(<DecisionOutcome decision={closed} onReopen={() => {}} />);

    expect(screen.getByRole("heading", { name: m.closed.title })).toBeInTheDocument();
    expect(screen.getByText(m.closed.line.replace("{start}", "12 jul").replace("{end}", "18 jul"))).toBeInTheDocument();
    expect(screen.getByText(m.closed.closedBy.replace("{name}", "Lucia Gomez"))).toBeInTheDocument();
  });

  it("offers reopening", () => {
    const onReopen = vi.fn();
    renderWithProviders(<DecisionOutcome decision={closed} onReopen={onReopen} />);

    fireEvent.click(screen.getByRole("button", { name: m.closed.reopen }));

    expect(onReopen).toHaveBeenCalled();
  });

  it("offers voting other dates only when asked to", () => {
    const onVoteOther = vi.fn();
    const first = renderWithProviders(<DecisionOutcome decision={closed} onReopen={() => {}} />);
    expect(screen.queryByRole("button", { name: m.empty.voteOther })).not.toBeInTheDocument();
    first.unmount();

    renderWithProviders(<DecisionOutcome decision={closed} onReopen={() => {}} onVoteOther={onVoteOther} />);
    fireEvent.click(screen.getByRole("button", { name: m.empty.voteOther }));

    expect(onVoteOther).toHaveBeenCalled();
  });
});
