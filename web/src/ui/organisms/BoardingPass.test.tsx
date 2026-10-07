import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BoardingPass } from "./BoardingPass";

const facts = [
  { label: "Fechas", value: "1 jul al 8 jul" },
  { label: "Destino", value: "Bariloche" },
];

describe("BoardingPass", () => {
  it("renders the media, the countdown figure and caption, and the facts as a definition list", () => {
    render(
      <BoardingPass
        media={<div role="img" aria-label="Portada" />}
        countdown={{ value: "10", unit: "días", caption: "para salir" }}
        facts={facts}
      />,
    );

    expect(screen.getByRole("img", { name: "Portada" })).toBeInTheDocument();
    expect(screen.getByText("10")).toHaveClass("ui-tabular");
    expect(screen.getByText("días")).toBeInTheDocument();
    expect(screen.getByText("para salir")).toBeInTheDocument();
    const list = screen.getByText("Destino").closest("dl") as HTMLElement;
    expect(within(list).getByText("Bariloche").tagName).toBe("DD");
    expect(within(list).getByText("1 jul al 8 jul")).toBeInTheDocument();
  });

  it("renders a fixed-size skeleton instead of a number when the countdown is unknown", () => {
    const { container } = render(<BoardingPass media={null} countdown={null} facts={facts} />);

    expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument();
    expect(container.querySelectorAll(".ui-skeleton").length).toBe(2);
    expect(container.querySelector(".trip-pass-value")).toBeNull();
  });

  it("server markup holds no day number, so it can never mismatch the client", () => {
    const html = renderToStaticMarkup(<BoardingPass media={null} countdown={null} facts={[]} />);

    expect(html.replace(/<[^>]*>/g, "")).toBe("");
  });

  it("renders the optional action under the caption and the media action over the picture", () => {
    render(
      <BoardingPass
        media={<div />}
        mediaAction={<button type="button">Cambiar foto</button>}
        countdown={{ value: "Sin fecha", caption: "Definan", action: <a href="/dates">Definir fechas</a> }}
        facts={[]}
      />,
    );

    expect(screen.getByRole("link", { name: "Definir fechas" })).toHaveAttribute("href", "/dates");
    expect(screen.getByRole("button", { name: "Cambiar foto" })).toBeInTheDocument();
  });

  it("hides the perforation from assistive tech", () => {
    const { container } = render(<BoardingPass media={null} countdown={null} facts={[]} />);

    expect(container.querySelector(".trip-pass-route")).toHaveAttribute("aria-hidden", "true");
  });
});
