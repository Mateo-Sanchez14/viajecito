import { act, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import messages from "../../../../messages/es-AR";
import { OfflineBanner } from "./OfflineBanner";

const setOnline = (value: boolean) =>
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value });

describe("OfflineBanner", () => {
  afterEach(() => setOnline(true));

  it("says the data is the last one downloaded while offline", () => {
    setOnline(false);
    renderWithProviders(<OfflineBanner />);

    expect(screen.getByRole("status")).toHaveTextContent(messages.pwa.offline.banner);
  });

  it("renders nothing while online", () => {
    setOnline(true);
    renderWithProviders(<OfflineBanner />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("follows the connection changes", () => {
    setOnline(true);
    renderWithProviders(<OfflineBanner />);

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("can be forced on, for the offline fallback page", () => {
    setOnline(true);
    renderWithProviders(<OfflineBanner always />);

    expect(screen.getByRole("status")).toHaveTextContent(messages.pwa.offline.banner);
  });
});
