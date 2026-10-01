import { describe, expect, it } from "vitest";
import messages from "../../../messages/es-AR";
import { mergeMessages } from "../../../messages/merge";

describe("mergeMessages", () => {
  it("keeps the namespaces of files that do not overlap", () => {
    const merged = mergeMessages({ proposals: { title: "a" } }, { dates: { title: "b" } });

    expect(merged).toEqual({ proposals: { title: "a" }, dates: { title: "b" } });
  });

  it("deep-merges objects that share a namespace instead of clobbering them", () => {
    const merged = mergeMessages(
      { shared: { one: { a: "1" } } },
      { shared: { one: { b: "2" }, two: "3" } },
    );

    expect(merged).toEqual({ shared: { one: { a: "1", b: "2" }, two: "3" } });
  });

  it("does not mutate its inputs", () => {
    const first = { x: { a: "1" } };
    mergeMessages(first, { x: { b: "2" } });

    expect(first).toEqual({ x: { a: "1" } });
  });
});

describe("es-AR message index", () => {
  it("exposes every feature namespace", () => {
    expect(Object.keys(messages)).toEqual(
      expect.arrayContaining(["app", "auth", "errors", "home", "ops", "trips"]),
    );
  });
});
