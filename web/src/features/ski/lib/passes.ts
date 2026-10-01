import type { PassIn, PassRow, PersonRef, SkiOverview } from "../api/ski";

/**
 * Predicts what the api will return after I set my pass, so the UI can flip at once.
 * The api judges each trip resort by my own row for it and falls back to my resort-less row;
 * `needed` or no row at all is missing (a trip without resorts is judged on the resort-less row
 * alone). Only my entries are recomputed; everyone else's stay as the api sent them.
 */
export function applyMyPass(overview: SkiOverview, me: PersonRef, pass: PassIn): SkiOverview {
  const resortId = pass.resort_id ?? null;
  const previous = overview.passes.rows.find(
    (row) => row.person.person_id === me.person_id && row.resort_id === resortId,
  );
  const row: PassRow = {
    person: me,
    resort_id: resortId,
    product: pass.product,
    days: pass.days ?? previous?.days ?? null,
    status: pass.status,
    price: pass.price != null ? String(pass.price) : (previous?.price ?? null),
    currency: pass.currency ?? previous?.currency ?? "",
  };
  const rows = overview.passes.rows.filter((r) => r !== previous).concat(row);

  const mine = rows.filter((r) => r.person.person_id === me.person_id);
  const rowFor = (target: string | null) =>
    mine.find((r) => r.resort_id === target) ?? mine.find((r) => r.resort_id === null);
  const targets = overview.resorts.length > 0 ? overview.resorts.map((r) => r.resort.id) : [null];
  const mineMissing = targets
    .filter((target) => {
      const effective = rowFor(target);
      return !effective || effective.status === "needed";
    })
    .map((target) => ({ person: me, resort_id: target }));

  const others = overview.passes.missing.filter((m) => m.person.person_id !== me.person_id);
  return { ...overview, passes: { rows, missing: [...others, ...mineMissing] } };
}
