import { expect, it } from "vitest";
import { applyMyPass } from "./passes";
import { LUCIA_REF, ME_REF, RESORT_ID, makeOverview, makePassRow } from "../test/fixtures";

it("replaces an omitted product with the API empty-string default, not the previous product", () => {
  const mine = makePassRow({ person: ME_REF, product: "Previous pass" });
  const other = makePassRow({ person: LUCIA_REF, product: "Keep this pass" });
  const overview = makeOverview({ passes: { rows: [mine, other], missing: [] } });
  const updated = applyMyPass(overview, ME_REF, { resort_id: RESORT_ID, status: "bought" });

  expect(updated.passes.rows.find((row) => row.person.person_id === ME_REF.person_id)?.product).toBe("");
  expect(updated.passes.rows.find((row) => row.person.person_id === LUCIA_REF.person_id)).toBe(other);
  expect(overview.passes.rows[0].product).toBe("Previous pass");
});

it("preserves an explicitly supplied product", () => {
  const updated = applyMyPass(makeOverview(), ME_REF, {
    resort_id: RESORT_ID, status: "bought", product: "New pass",
  });
  expect(updated.passes.rows.find((row) => row.person.person_id === ME_REF.person_id)?.product).toBe("New pass");
});
