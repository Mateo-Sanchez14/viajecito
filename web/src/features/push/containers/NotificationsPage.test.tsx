import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import messages from "../../../../messages/es-AR";
import { NotificationsPage } from "./NotificationsPage";

vi.mock("./PushSettings", () => ({ PushSettings: () => <p>settings body</p> }));

describe("NotificationsPage", () => {
  it("has one h1 and hosts the push settings", () => {
    renderWithProviders(<NotificationsPage />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: messages.push.title })).toBeInTheDocument();
    expect(screen.getByText("settings body")).toBeInTheDocument();
  });
});
