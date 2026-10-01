import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import messages from "../../../../messages/es-AR";
import { LUCIA_REF, ME_REF } from "../test/fixtures";
import { LevelGroups } from "./LevelGroups";

const t = messages.ski.levels;
const label = (discipline: string, level: string) =>
  t.group.replace("{discipline}", discipline).replace("{level}", level);

describe("LevelGroups", () => {
  it("groups people by discipline and level", () => {
    renderWithProviders(
      <LevelGroups
        groups={[
          { discipline: "ski", level: "beginner", people: [ME_REF, LUCIA_REF] },
          { discipline: "snowboard", level: "expert", people: [LUCIA_REF] },
        ]}
      />,
    );

    const groups = screen.getAllByRole("listitem");
    expect(groups).toHaveLength(2);
    expect(within(groups[0]).getByText(label("Ski", "Principiante"))).toBeInTheDocument();
    expect(groups[0]).toHaveTextContent("Mateo");
    expect(groups[0]).toHaveTextContent("Lucia Gomez");
    expect(within(groups[1]).getByText(label("Snowboard", "Experto"))).toBeInTheDocument();
  });

  it("says nobody filled in their profile when there are no groups", () => {
    renderWithProviders(<LevelGroups groups={[]} />);

    expect(screen.getByText(t.empty)).toBeInTheDocument();
  });
});
