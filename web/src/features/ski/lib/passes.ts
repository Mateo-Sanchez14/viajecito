import type { PassIn, PersonRef, SkiOverview } from "../api/ski";

/**
 * Predicts what the api will return after I set my pass, so the UI can flip at once:
 * my row for that resort is replaced, and my "missing" entries are cleared unless the
 * status is still `needed`. A resort-less pass (`resort_id` null) covers every resort.
 */
export function applyMyPass(overview: SkiOverview, me: PersonRef, pass: PassIn): SkiOverview {
  const resortId = pass.resort_id ?? null;
  const previous = overview.passes.rows.find(
    (row) => row.person.person_id === me.person_id && row.resort_id === resortId,
  );
  const row = {
    person: me,
    resort_id: resortId,
    product: pass.product ?? previous?.product ?? "",
    days: pass.days ?? previous?.days ?? null,
    status: pass.status,
    price: pass.price ?? previous?.price ?? null,
    currency: pass.currency ?? previous?.currency ?? "",
  };
  const rows = overview.passes.rows.filter((r) => r !== previous).concat(row);

  const mine = (m: { person: PersonRef; resort_id: string | null }) => m.person.person_id === me.person_id;
  let missing = overview.passes.missing;
  if (pass.status === "needed") {
    if (!missing.some((m) => mine(m) && m.resort_id === resortId)) {
      missing = [...missing, { person: me, resort_id: resortId }];
    }
  } else {
    missing = missing.filter((m) => !(mine(m) && (resortId === null || m.resort_id === resortId)));
  }

  return { ...overview, passes: { rows, missing } };
}
