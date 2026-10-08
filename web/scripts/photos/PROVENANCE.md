# Destination photos: provenance

Every file in `web/public/photos/` comes from the photos below, built by `pnpm photos:build` from the
entries of `photos.json`. The downloaded originals (1920 px JPEG) live only in the gitignored
`scripts/photos/sources/` and are never committed. Only Pexels-licensed stock is used.

- **License**: [Pexels License](https://www.pexels.com/license/): free to use and modify, attribution not
  required, no implied endorsement, no resale of unmodified copies. The credit is still kept in
  `src/ui/photos/manifest.json` and here. Source URLs are the full Pexels photo page URLs.
- **Approval**: each photo was approved by the maintainer individually on **2026-10-08** (Engram, project
  `viajecito`, topic `odd/home-alive/photos`). The download itself was done by the orchestrator, not by the
  build script, and never by the writer of this pipeline.
- **Build**: landscape photos are encoded at 640 and 1280 px wide, portraits at 400 and 800 px (never
  upscaled), WebP with the quality lowered from 80 until each file is at most 150 KB (the build fails when it
  cannot), metadata stripped, files named `<id>.<content hash>.<width>.webp`. Served from `/photos/` (not
  `/media/` or `/static/`, which the tunnel routes to the api) with immutable cache headers.
- **Content check** (2026-10-08): the sources were reviewed by the orchestrator and the encoded 640/400 px
  variants again while building this library. Criteria: no identifiable people, no legible license plates,
  no legible brands or prices. Pass for all thirteen. Notes: the Obelisco street shows a few cars at dusk
  (specks, no legible plates); the packing photo shows a passport and phone with no legible data; the map
  photo shows a printed world map (place names are public cartography).
- **Excluded** by the same check and never added: a fruit stand (legible price tags) and a banknote close-up.

| Id | Use | Author | Source | Orientation | Files (size) |
|---|---|---|---|---|---|
| snow-peaks | scene snow | Eberhard Grossgasteiger | https://www.pexels.com/photo/landscape-photography-of-mountains-covered-in-snow-691668/ | landscape | `snow-peaks.ca18be1e1b.640.webp` (16 KB); `snow-peaks.ca18be1e1b.1280.webp` (67 KB) |
| snow-lake | scene snow | Eberhard Grossgasteiger | https://www.pexels.com/photo/snow-covered-mountains-790545/ | landscape | `snow-lake.a16c23249a.640.webp` (39 KB); `snow-lake.a16c23249a.1280.webp` (125 KB) |
| lake-patagonia | scene lake | Belén Montero | https://www.pexels.com/photo/scenic-view-of-lake-and-mountains-in-patagonia-35747415/ | landscape | `lake-patagonia.1b614cdd2f.640.webp` (31 KB); `lake-patagonia.1b614cdd2f.1280.webp` (105 KB) |
| beach-aerial | scene beach | Caleb Oquendo | https://www.pexels.com/photo/aerial-photo-of-sea-2927021/ | landscape | `beach-aerial.4980be55d6.640.webp` (29 KB); `beach-aerial.4980be55d6.1280.webp` (86 KB) |
| beach-foam | scene beach | Asad Photo Maldives | https://www.pexels.com/photo/serene-white-sand-beach-and-turquoise-water-28408402/ | landscape | `beach-foam.cb761bdad9.640.webp` (27 KB); `beach-foam.cb761bdad9.1280.webp` (89 KB) |
| vineyard | scene vineyard | Mariana La Regina | https://www.pexels.com/photo/picturesque-vineyards-in-tunuyan-mendoza-with-andes-backdrop-31025236/ | landscape | `vineyard.197159c410.640.webp` (48 KB); `vineyard.197159c410.1280.webp` (137 KB) |
| desert | scene desert | Stephen Leonardi | https://www.pexels.com/photo/serene-desert-landscape-at-sunrise-28639363/ | landscape | `desert.aae40bf791.640.webp` (13 KB); `desert.aae40bf791.1280.webp` (40 KB) |
| city-madero | scene city | Andres Idda Bianchi | https://www.pexels.com/photo/skyscrapers-in-skyline-of-buenos-aires-argentina-20985696/ | portrait, focal 50% 35% | `city-madero.87776c3dcc.400.webp` (32 KB); `city-madero.87776c3dcc.800.webp` (106 KB) |
| city-obelisco | scene city | Andres Idda Bianchi | https://www.pexels.com/photo/obelisk-tower-in-buenos-aires-during-sunset-22690629/ | portrait, focal 50% 35% | `city-obelisco.3add2e099c.400.webp` (23 KB); `city-obelisco.3add2e099c.800.webp` (70 KB) |
| road | scene road | Stephen Leonardi | https://www.pexels.com/photo/the-empty-road-with-mountains-in-the-background-28134859/ | landscape | `road.1678d44a59.640.webp` (22 KB); `road.1678d44a59.1280.webp` (69 KB) |
| packing | banner logistics | Kindel Media | https://www.pexels.com/photo/photo-of-a-packed-suitcase-8212231/ | landscape, banner crop 50% 40% | `packing.a415d6acc4.640.webp` (51 KB); `packing.a415d6acc4.1280.webp` (134 KB) |
| map | banner map | Lara Jameson | https://www.pexels.com/photo/still-life-with-notebook-and-pined-map-8828439/ | landscape, banner crop 50% 55% | `map.0c542a0785.640.webp` (26 KB); `map.0c542a0785.1280.webp` (64 KB) |
| planner | banner planner | Karola G | https://www.pexels.com/photo/weekly-planner-next-to-a-black-pen-5706225/ | landscape, banner crop 30% 88% | `planner.1301af117b.640.webp` (5 KB); `planner.1301af117b.1280.webp` (13 KB) |

Total committed photo payload: 1.43 MB (1503362 bytes) in 26 files (cap: each file <= 150 KB).
