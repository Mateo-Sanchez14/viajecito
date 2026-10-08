import { describe, expect, it } from "vitest";
import { coverScene, inferCoverScene } from "./coverScene";

const SCENES = ["road", "beach", "snow", "city"];

describe("coverScene", () => {
  it("maps ski trips to the snow scene whatever the id", () => {
    expect(coverScene({ id: "a", type: "ski" })).toBe("snow");
    expect(coverScene({ id: "b", type: "ski" })).toBe("snow");
  });

  it("is deterministic for the same trip", () => {
    const trip = { id: "22222222-2222-4222-8222-222222222222", type: "generic" };

    expect(coverScene(trip)).toBe(coverScene({ ...trip }));
  });

  it("falls back to a known non-snow scene for unregistered types", () => {
    for (const type of ["generic", "mystery", ""]) {
      const scene = coverScene({ id: "33333333-3333-4333-8333-333333333333", type });
      expect(SCENES).toContain(scene);
      expect(scene).not.toBe("snow");
    }
  });

  it("spreads different ids over the default scenes", () => {
    const ids = Array.from({ length: 60 }, (_, index) => `trip-${index}`);
    const scenes = new Set(ids.map((id) => coverScene({ id, type: "generic" })));

    expect(scenes).toEqual(new Set(["road", "city", "beach"]));
  });
});

describe("coverScene keyword inference", () => {
  const scene = (destination_label: string, name = "", type = "generic") =>
    coverScene({ id: "44444444-4444-4444-8444-444444444444", type, name, destination_label });

  it.each([
    ["Bariloche", "snow"],
    ["Cerro Catedral", "snow"],
    ["Valle Nevado, Chile", "snow"],
    ["Lago Puelo", "snow"],
    ["Mar del Plata", "beach"],
    ["Punta del Este", "beach"],
    ["Florianópolis", "beach"],
    ["Mendoza", "road"],
    ["Cafayate", "road"],
    ["Salta y Jujuy", "road"],
    ["Buenos Aires", "city"],
    ["Madrid", "city"],
    ["Nueva York", "city"],
    ["Ruta 40", "road"],
  ] as const)("reads %s as %s", (destination, expected) => {
    expect(scene(destination)).toBe(expected);
  });

  it("ignores case and accents", () => {
    expect(scene("FLORIANOPOLIS")).toBe(scene("florianópolis"));
    expect(scene("ESQUÍ")).toBe("snow");
  });

  it("matches whole words only", () => {
    // "mar" is a beach word, but never inside another word; the id decides these.
    expect(["road", "city", "beach"]).toContain(scene("Marruecos"));
    expect(scene("Primavera en el parque", "", "generic")).not.toBe("snow");
  });

  it("falls back to the trip name when the destination says nothing", () => {
    expect(scene("", "Finde en Pinamar")).toBe("beach");
    expect(scene("Algún lugar", "Semana de esquí")).toBe("snow");
  });

  it("prefers the destination over the name", () => {
    expect(scene("Mar del Plata", "Cerro Catedral con amigos")).toBe("beach");
  });

  it("keeps ski trips on the snow scene even when the destination points elsewhere", () => {
    expect(scene("Mar del Plata", "", "ski")).toBe("snow");
  });

  it("still gives a stable scene to trips that name nothing recognisable", () => {
    expect(scene("Zzz", "Qqq")).toBe(scene("Zzz", "Qqq"));
    expect(["road", "city", "beach"]).toContain(scene("Zzz", "Qqq"));
  });
});

describe("inferCoverScene", () => {
  it("is null when nothing is recognised, so callers can tell a hint from a fallback", () => {
    expect(inferCoverScene({ type: "generic", name: "Qqq", destination_label: "Zzz" })).toBeNull();
    expect(inferCoverScene({ type: "generic" })).toBeNull();
  });

  it("reads ski trips as snow and keywords as their scene", () => {
    expect(inferCoverScene({ type: "ski" })).toBe("snow");
    expect(inferCoverScene({ type: "generic", destination_label: "Pinamar" })).toBe("beach");
  });
});
