import { describe, expect, it } from "vitest";
import { coverScene, footageScene, inferTripKind, sceneKind, tripPhoto } from "./coverScene";

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

describe("inferTripKind", () => {
  it("is null when nothing is recognised, so callers can tell a hint from a fallback", () => {
    expect(inferTripKind({ type: "generic", name: "Qqq", destination_label: "Zzz" })).toBeNull();
    expect(inferTripKind({ type: "generic" })).toBeNull();
  });

  it("reads ski trips as snow and keywords as their kind", () => {
    expect(inferTripKind({ type: "ski" })).toBe("snow");
    expect(inferTripKind({ type: "generic", destination_label: "Pinamar" })).toBe("beach");
  });

  it.each([
    ["Lago Puelo", "lake"],
    ["Villa La Angostura", "lake"],
    ["Mendoza, Argentina", "vineyard"],
    ["Cafayate", "vineyard"],
    ["Salta y Jujuy", "desert"],
    ["San Pedro de Atacama", "desert"],
    ["Buenos Aires", "city"],
    ["Bariloche", "snow"],
    ["Mar del Plata", "beach"],
  ] as const)("keeps %s as its own kind: %s, not folded into another scene", (destination, kind) => {
    expect(inferTripKind({ type: "generic", destination_label: destination })).toBe(kind);
  });
});

describe("road trips", () => {
  const roadTrip = { id: "9c1b8c1e-52c4-4f4e-9f57-0d2a3a8d6a10", type: "generic", name: "Road trip por la Ruta 40", destination_label: "Ruta 40" };

  it("reads the exact 'Road trip por la Ruta 40' as a road, never a city", () => {
    expect(inferTripKind(roadTrip)).toBe("road");
    expect(sceneKind(roadTrip)).toBe("road");
    expect(coverScene(roadTrip)).toBe("road");
    expect(tripPhoto(roadTrip)?.id).toBe("road");
  });

  it.each(["Ruta 40", "ruta 7", "Road trip", "roadtrip", "Carretera Austral", "Autopista del Sol", "Highway 1", "Viaje en auto", "motorhome", "Camper por el sur"])(
    "reads %s as a road",
    (words) => {
      expect(inferTripKind({ type: "generic", destination_label: words })).toBe("road");
      expect(inferTripKind({ type: "generic", name: words })).toBe("road");
    },
  );

  it("matches road words as whole words only", () => {
    expect(inferTripKind({ type: "generic", destination_label: "Rutina" })).toBeNull();
    expect(inferTripKind({ type: "generic", destination_label: "Autopistas" })).toBeNull();
  });
});

describe("sceneKind, coverScene, tripPhoto and footageScene", () => {
  const trip = (destination_label: string, id = "44444444-4444-4444-8444-444444444444") => ({ id, type: "generic", name: "", destination_label });

  it("folds the finer kinds into the four illustration scenes", () => {
    expect(coverScene(trip("Lago Puelo"))).toBe("snow");
    expect(coverScene(trip("Mendoza"))).toBe("road");
    expect(coverScene(trip("Salta"))).toBe("road");
    expect(coverScene(trip("Madrid"))).toBe("city");
  });

  it("falls back to a stable road, city or beach kind for trips that name nothing", () => {
    const kinds = new Set(Array.from({ length: 60 }, (_, index) => sceneKind(trip("Zzz", `trip-${index}`))));

    expect(kinds).toEqual(new Set(["road", "city", "beach"]));
  });

  it("gives each trip a photo of its own kind, the same one every time", () => {
    expect(tripPhoto(trip("Lago Puelo"))?.id).toBe("lake-patagonia");
    expect(tripPhoto(trip("Mendoza"))?.id).toBe("vineyard");
    expect(tripPhoto(trip("Salta"))?.id).toBe("desert");
    expect(["snow-peaks", "snow-lake"]).toContain(tripPhoto(trip("Bariloche"))?.id);
    expect(["city-madero", "city-obelisco"]).toContain(tripPhoto(trip("Buenos Aires"))?.id);
    expect(tripPhoto(trip("Bariloche"))?.id).toBe(tripPhoto(trip("Bariloche"))?.id);
  });

  it("uses the generic footage only where it fits: snow, beach and road, never the Sydney city loop", () => {
    expect(footageScene(trip("Bariloche"))).toBe("snow");
    expect(footageScene(trip("Pinamar"))).toBe("beach");
    expect(footageScene(trip("Ruta 40"))).toBe("road");
    for (const place of ["Buenos Aires", "Lago Puelo", "Mendoza", "Salta"]) expect(footageScene(trip(place)), place).toBeNull();
  });
});
