import { ButtonLink } from "@/ui/atoms/ButtonLink";
import type { BoardingPassCountdown } from "@/ui/organisms/BoardingPass";
import type { Countdown } from "./countdown";

type Translate = (key: string, values?: Record<string, number>) => string;

/**
 * The countdown copy for a state, shared by the trip hero and the home hero. `t` resolves keys under
 * `trips.hero.countdown`; `setDatesHref` is where an undated trip sends the "set the dates" action.
 */
export function describeCountdown(
  state: Countdown,
  t: Translate,
  setDatesHref: string | null,
): BoardingPassCountdown {
  switch (state.kind) {
    case "upcoming":
      return state.days === 1
        ? { value: t("tomorrow"), caption: t("tomorrowCaption") }
        : {
            value: String(state.days),
            count: state.days,
            unit: t("upcomingUnit", { days: state.days }),
            caption: t("upcomingCaption"),
          };
    case "today":
      return { value: t("today"), caption: t("todayCaption") };
    case "ongoing":
      return {
        value: t("ongoing", { day: state.day }),
        unit: t("ongoingUnit", { total: state.total }),
        caption: t("ongoingCaption"),
      };
    case "done":
      return { value: t("done"), caption: t("doneCaption") };
    case "undated":
      return {
        value: t("undated"),
        caption: t("undatedCaption"),
        action: setDatesHref ? (
          <ButtonLink href={setDatesHref} variant="secondary" size="sm">
            {t("setDates")}
          </ButtonLink>
        ) : undefined,
      };
  }
}
