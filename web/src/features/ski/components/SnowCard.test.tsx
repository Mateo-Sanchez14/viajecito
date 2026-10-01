import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import messages from "../../../../messages/es-AR";
import { LUCIA_REF, makeReport } from "../test/fixtures";
import { SnowCard } from "./SnowCard";

const t = messages.ski.conditions;

describe("SnowCard", () => {
  it("shows base, new snow, forecast and temperature with units", () => {
    renderWithProviders(<SnowCard resortName="Cerro Catedral" report={makeReport()} />);

    expect(screen.getByRole("heading", { name: "Cerro Catedral" })).toBeInTheDocument();
    expect(screen.getByText("120 cm")).toBeInTheDocument();
    expect(screen.getByText("15,5 cm")).toBeInTheDocument();
    expect(screen.getByText("30 cm")).toBeInTheDocument();
    expect(screen.getByText("-4 °C")).toBeInTheDocument();
    expect(screen.getByText(t.base)).toBeInTheDocument();
  });

  it("has no stale badge when the data is fresh", () => {
    renderWithProviders(<SnowCard resortName="Cerro Catedral" report={makeReport({ stale: false })} />);

    expect(screen.queryByText(/Dato de hace/)).not.toBeInTheDocument();
  });

  it("flags stale data with text and the age in hours", () => {
    renderWithProviders(
      <SnowCard resortName="Cerro Catedral" report={makeReport({ stale: true, age_hours: 14 })} />,
    );

    expect(screen.getByText(t.stale.replace("{hours}", "14"))).toBeInTheDocument();
  });

  it("names Open-Meteo as the source of provider data", () => {
    renderWithProviders(<SnowCard resortName="Cerro Catedral" report={makeReport({ source: "open_meteo" })} />);

    expect(screen.getByText(t.source.open_meteo)).toBeInTheDocument();
  });

  it("names the reporter of a manual report, with lifts and the comment", () => {
    renderWithProviders(
      <SnowCard
        resortName="Cerro Catedral"
        report={makeReport({
          source: "manual",
          reporter: LUCIA_REF,
          lifts_open: 8,
          lifts_total: 12,
          status_text: "Polvo en la ladera sur",
          forecast_72h_cm: null,
        })}
      />,
    );

    expect(screen.getByText(t.source.manual.replace("{name}", "Lucia Gomez"))).toBeInTheDocument();
    expect(screen.getByText(t.openOfTotal.replace("{open}", "8").replace("{total}", "12"))).toBeInTheDocument();
    expect(screen.getByText("Polvo en la ladera sur")).toBeInTheDocument();
    expect(screen.queryByText(t.forecast)).not.toBeInTheDocument();
  });

  it("says there is no data yet when the resort has no report", () => {
    renderWithProviders(<SnowCard resortName="Cerro Catedral" report={null} />);

    expect(screen.getByText(t.noData)).toBeInTheDocument();
  });
});
