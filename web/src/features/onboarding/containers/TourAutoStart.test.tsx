import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MeProvider } from "@/features/auth/MeProvider";
import { makeMe } from "@/features/trips/fixtures";
import { TourProvider, useTour } from "../TourProvider";
import { CaptureTour, tour } from "../test/captureTour";
import { TOUR_VERSION } from "../lib/version";
import { AUTO_START_DELAY_MS, TourAutoStart } from "./TourAutoStart";

function setup(seen: number) {
  const me = makeMe();
  return render(
    <MeProvider me={{ ...me, person: { ...me.person, tour_seen_version: seen } }}>
      <TourProvider>
        <CaptureTour />
        <TourAutoStart />
      </TourProvider>
    </MeProvider>,
  );
}

const wait = (ms = AUTO_START_DELAY_MS) => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("TourAutoStart", () => {
  it("starts after the settle delay when this version has not been seen", () => {
    setup(0);

    wait(AUTO_START_DELAY_MS - 1);
    expect(tour.running).toBe(false);
    wait(1);
    expect(tour.running).toBe(true);
  });

  it("never starts for a person who saw this version", () => {
    setup(TOUR_VERSION);

    wait(5000);

    expect(tour.running).toBe(false);
  });

  it("never starts for a person ahead of this app version", () => {
    setup(TOUR_VERSION + 1);

    wait(5000);

    expect(tour.running).toBe(false);
  });

  it("honours a replay requested before the overview mounted", () => {
    const me = makeMe();
    function Page({ mounted }: { mounted: boolean }) {
      return (
        <MeProvider me={{ ...me, person: { ...me.person, tour_seen_version: TOUR_VERSION } }}>
          <TourProvider>
            <CaptureTour />
            <Requester />
            {mounted && <TourAutoStart />}
          </TourProvider>
        </MeProvider>
      );
    }
    function Requester() {
      const { requestStart } = useTour();
      return (
        <button type="button" onClick={requestStart}>
          ask
        </button>
      );
    }
    const view = render(<Page mounted={false} />);
    act(() => view.getByText("ask").click());

    view.rerender(<Page mounted />);
    wait();

    expect(tour.running).toBe(true);
  });

  it("does not start while another modal dialog is open, and starts once it is closed", () => {
    const sheet = document.createElement("dialog");
    sheet.setAttribute("open", "");
    document.body.append(sheet);
    setup(0);

    wait(AUTO_START_DELAY_MS * 3);
    expect(tour.running).toBe(false);

    sheet.removeAttribute("open");
    wait();
    expect(tour.running).toBe(true);
  });

  it("does not start a second time in the same visit after it ended", () => {
    setup(0);
    wait();
    expect(tour.running).toBe(true);

    act(() => tour.stop());
    wait(5000);

    expect(tour.running).toBe(false);
  });

  it("cancels the pending start when the page unmounts", () => {
    const view = setup(0);

    view.unmount();
    wait(5000);

    expect(tour.running).toBe(false);
  });
});
