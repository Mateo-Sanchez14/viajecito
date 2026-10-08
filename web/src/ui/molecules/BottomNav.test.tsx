import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BottomNav, type BottomNavItem } from "./BottomNav";

const icon = <svg aria-hidden="true" />;

function item(key: string, label: string, active = false): BottomNavItem {
  return { key, label, href: `/t/${key}`, active, icon };
}

const primary = [item("overview", "Resumen"), item("proposals", "Propuestas"), item("logistics", "Logística")];
const secondary = [item("dates", "Fechas"), item("budget", "Plata"), item("ski", "Ski")];

function setup(
  props: { items?: BottomNavItem[]; more?: BottomNavItem[] | null } = {},
) {
  const items = props.items ?? primary;
  const more = props.more === undefined ? secondary : props.more;
  render(
    // jsdom cannot navigate: swallow the default action of link clicks.
    <div onClick={(event) => event.preventDefault()}>
      <BottomNav
        label="Menú del viaje"
        items={items}
        more={
          more
            ? { label: "Más", title: "Más secciones", closeLabel: "Cerrar", icon, items: more }
            : undefined
        }
      />
    </div>,
  );
  return screen.getByRole("navigation", { name: "Menú del viaje" });
}

describe("BottomNav", () => {
  it("renders a labelled landmark with one link per primary item", () => {
    const nav = setup();

    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Resumen", "Propuestas", "Logística"]);
    expect(links[1]).toHaveAttribute("href", "/t/proposals");
  });

  it("carries a data-tour anchor only when asked, without changing the landmark", () => {
    expect(setup()).not.toHaveAttribute("data-tour");
    cleanup();

    render(<BottomNav label="Menú del viaje" items={primary} tourAnchor="nav" />);
    expect(screen.getByRole("navigation", { name: "Menú del viaje" })).toHaveAttribute("data-tour", "nav");
  });

  it("marks only the active item as the current page", () => {
    const nav = setup({ items: [item("overview", "Resumen"), item("proposals", "Propuestas", true)] });

    expect(within(nav).getByRole("link", { name: "Propuestas" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Resumen" })).not.toHaveAttribute("aria-current");
  });

  it("sizes the grid to the number of slots, counting the more button", () => {
    const nav = setup();

    expect((nav.querySelector("ul") as HTMLElement).style.getPropertyValue("--items")).toBe("4");
  });

  it("renders the active icon for the current page", () => {
    render(
      <BottomNav
        label="Menú"
        items={[
          { ...item("a", "A", true), icon: <i data-testid="regular" />, activeIcon: <i data-testid="filled" /> },
          { ...item("b", "B"), icon: <i data-testid="other" />, activeIcon: <i data-testid="never" /> },
        ]}
      />,
    );

    expect(screen.getByTestId("filled")).toBeInTheDocument();
    expect(screen.queryByTestId("regular")).not.toBeInTheDocument();
    expect(screen.getByTestId("other")).toBeInTheDocument();
    expect(screen.queryByTestId("never")).not.toBeInTheDocument();
  });

  it("has no more button when no overflow is given", () => {
    const nav = setup({ more: null });

    expect(within(nav).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens a dialog with the secondary items only, and not the primary ones", () => {
    const nav = setup();
    const more = within(nav).getByRole("button", { name: "Más" });
    expect(more).toHaveAttribute("aria-haspopup", "dialog");
    expect(more).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(more);

    const dialog = screen.getByRole("dialog", { name: "Más secciones" });
    expect(within(dialog).getAllByRole("link").map((link) => link.textContent)).toEqual(["Fechas", "Plata", "Ski"]);
    expect(within(dialog).queryByRole("link", { name: "Resumen" })).not.toBeInTheDocument();
    expect(more).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps the secondary links out of the page until the sheet is opened", () => {
    setup();

    expect(screen.queryByRole("link", { name: "Fechas" })).not.toBeInTheDocument();
  });

  it("closes the sheet when a destination is chosen", () => {
    const nav = setup();
    fireEvent.click(within(nav).getByRole("button", { name: "Más" }));

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("link", { name: "Plata" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the sheet with the close button and returns focus to the more button", () => {
    const nav = setup();
    const more = within(nav).getByRole("button", { name: "Más" });
    more.focus();
    fireEvent.click(more);

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cerrar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(more).toHaveFocus();
  });

  it("shows the active state on the more button when the current page lives in the sheet", () => {
    const nav = setup({ more: [item("dates", "Fechas"), item("documents", "Documentos", true)] });

    const more = within(nav).getByRole("button", { name: "Más" });
    expect(more).toHaveAttribute("data-active", "true");
    fireEvent.click(more);
    expect(within(screen.getByRole("dialog")).getByRole("link", { name: "Documentos" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("does not show the active state on the more button for a primary page", () => {
    const nav = setup({ items: [item("overview", "Resumen", true)] });

    expect(within(nav).getByRole("button", { name: "Más" })).not.toHaveAttribute("data-active");
  });
});
