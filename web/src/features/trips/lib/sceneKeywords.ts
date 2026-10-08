import type { PhotoScene } from "@/ui/photos/photos";
import type { CoverScene } from "./coverScene";

/** What a trip's destination or name talks about. Several kinds share one image. */
export type SceneKind = PhotoScene;

/** The illustrations are four scenes: kinds without a drawing of their own borrow the closest one. */
export const SCENE_FOR_KIND: Record<SceneKind, CoverScene> = {
  snow: "snow",
  lake: "snow", // mountain lakes sit under snowy peaks in the Andes
  beach: "beach",
  vineyard: "road", // a drive between vines
  desert: "road", // a drive through the quebradas
  city: "city",
  road: "road",
};

/**
 * Keywords per kind, in priority order (the first kind that matches wins). Entries are lowercase
 * and accent-free; multi-word entries match as a phrase and every entry matches whole words only,
 * so "mar" never fires inside "Marruecos". Mostly Argentine and nearby destinations, because that
 * is where this crew travels.
 */
export const SCENE_KEYWORDS: readonly (readonly [SceneKind, readonly string[]])[] = [
  [
    "snow",
    [
      "esqui", "esquiar", "ski", "snowboard", "nieve", "snow", "nevado", "glaciar", "glaciares", "andes",
      "montana", "montanas", "bariloche", "catedral", "cerro catedral", "cerro castor", "chapelco",
      "las lenas", "valle nevado", "penitentes", "la parva", "farellones", "el colorado", "chillan",
      "portillo", "aconcagua", "ushuaia", "el calafate", "calafate", "el chalten", "chalten", "patagonia",
      "antartida", "alpes", "pucon", "villarrica",
    ],
  ],
  [
    "lake",
    [
      "lago", "lagos", "lake", "nahuel huapi", "villa la angostura", "san martin de los andes", "el bolson",
      "siete lagos", "traful", "lacar", "puelo",
    ],
  ],
  [
    "beach",
    [
      "playa", "playas", "beach", "mar", "mar del plata", "pinamar", "carilo", "villa gesell", "gesell",
      "punta del este", "punta del diablo", "jose ignacio", "rocha", "cabo polonio", "cancun", "caribe",
      "punta cana", "tulum", "playa del carmen", "bombinhas", "florianopolis", "floripa", "rio de janeiro",
      "buzios", "maceio", "porto de galinhas", "miami", "costa", "balneario", "necochea", "miramar",
      "monte hermoso", "las grutas", "puerto madryn", "santa teresita", "san clemente", "mar de las pampas",
      "bahia", "isla", "islas", "cabo", "resort", "all inclusive",
    ],
  ],
  [
    "vineyard",
    [
      "vino", "vinos", "wine", "bodega", "bodegas", "vinedo", "vinedos", "mendoza", "valle de uco", "uco",
      "lujan de cuyo", "maipu", "tupungato", "tunuyan", "san rafael", "cafayate", "colonia caroya",
    ],
  ],
  [
    "desert",
    [
      "desierto", "desert", "salta", "jujuy", "atacama", "san pedro de atacama", "purmamarca", "tilcara",
      "humahuaca", "quebrada", "valles calchaquies", "tafi del valle", "ischigualasto", "talampaya",
      "uyuni", "salinas grandes", "dunas", "catamarca", "la rioja",
    ],
  ],
  [
    "city",
    [
      "ciudad", "city", "buenos aires", "caba", "bsas", "capital federal", "santiago", "lima", "bogota",
      "medellin", "ciudad de mexico", "cdmx", "madrid", "barcelona", "paris", "londres", "london", "roma",
      "rome", "nueva york", "new york", "nyc", "berlin", "amsterdam", "lisboa", "tokio", "tokyo", "sao paulo",
      "montevideo", "cordoba", "rosario", "la plata", "asuncion", "viena", "praga", "estambul", "dubai",
      "las vegas", "los angeles", "san francisco", "chicago", "mexico",
    ],
  ],
  ["road", ["ruta", "rutas", "ruta 40", "ruta 7", "road trip", "roadtrip", "carretera", "autopista", "highway", "camper", "motorhome", "en auto"]],
];

const words = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join(" ");

const PADDED = SCENE_KEYWORDS.map(
  ([kind, keywords]) => [kind, keywords.map((keyword) => ` ${words(keyword)} `)] as const,
);

/** The kind of place a piece of text points to, or `null` when it names nothing we recognise. */
export function inferSceneKind(text: string): SceneKind | null {
  const haystack = ` ${words(text)} `;
  if (haystack.trim() === "") return null;
  for (const [kind, keywords] of PADDED) {
    if (keywords.some((keyword) => haystack.includes(keyword))) return kind;
  }
  return null;
}
