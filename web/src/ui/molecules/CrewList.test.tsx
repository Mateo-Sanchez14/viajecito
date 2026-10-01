import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import messages from "../../../messages/es-AR.json";
import { CrewList } from "./CrewList";

const crew = {
  id: "c1",
  name: "Los Pibes",
  role: "admin" as const,
  gastito_group_url: null,
  default_trip_id: null,
};

describe("CrewList", () => {
  it("shows each crew with its role badge", () => {
    renderWithProviders(
      <CrewList crews={[crew, { ...crew, id: "c2", name: "Familia", role: "member" }]} />,
    );

    expect(screen.getByText("Los Pibes")).toBeInTheDocument();
    expect(screen.getByText(messages.home.crews.role.admin)).toBeInTheDocument();
    expect(screen.getByText("Familia")).toBeInTheDocument();
    expect(screen.getByText(messages.home.crews.role.member)).toBeInTheDocument();
  });

  it("shows the empty state without crews", () => {
    renderWithProviders(<CrewList crews={[]} />);

    expect(screen.getByText(messages.home.crews.empty)).toBeInTheDocument();
  });
});
