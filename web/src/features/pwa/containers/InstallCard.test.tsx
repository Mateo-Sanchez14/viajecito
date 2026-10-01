import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import messages from "../../../../messages/es-AR";
import { resetInstallCapture } from "../lib/installEvent";
import { InstallCard } from "./InstallCard";

describe("InstallCard", () => {
  beforeEach(() => {
    resetInstallCapture();
    window.localStorage.clear();
  });
  afterEach(() => resetInstallCapture());

  it("shows the install offer once the browser allows it", () => {
    renderWithProviders(<InstallCard tripId="t" crewId="c" />);
    expect(screen.queryByText(messages.pwa.install.title)).not.toBeInTheDocument();

    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: vi.fn(),
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(screen.getByText(messages.pwa.install.title)).toBeInTheDocument();
  });
});
