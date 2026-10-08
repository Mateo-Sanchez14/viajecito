# Ambient clips: provenance

Every file in `web/public/ambient/` comes from the clips below, built by `pnpm ambient:build` from the
sources listed in `clips.json`. The downloaded originals live only in the gitignored
`scripts/ambient/sources/` and are never committed. Only Pexels-licensed stock is used.

- **License**: [Pexels License](https://www.pexels.com/license/): free to use and modify, attribution not
  required. The credit is still kept in `src/ui/ambient/manifest.json` and here.
- **Approval**: each file was approved by the maintainer individually on **2026-10-07** (filename, source URL,
  license and size shown before the download; recorded in Engram, project `viajecito`, topic
  `sdd/alive-ui/tasks-s6`). The download itself was done by the orchestrator, not by the build script.
- **Build**: 8 s trim, `scale=-2:720`, 30 fps constant, H.264 High 4.0, `yuv420p`, CRF 27, no audio,
  `+faststart`, metadata stripped; poster = first frame of the encoded clip as WebP q72.
- **Visual check** (2026-10-07): the original contact sheets and the encoded frames of every committed clip
  were reviewed. Criteria: no identifiable people, no legible license plates, no legible brands.

| Scene | Author | Source | Trim | Files (size) | Content check |
|---|---|---|---|---|---|
| city | Amit | https://www.pexels.com/video/city-view-in-timelapse-mode-1654210/ | start 1 s, 8 s | `city.88fd55d09f.mp4` (2.24 MB), `city.88fd55d09f.webp` (82 KB) | Pass. Elevated view of a city and a motorway; vehicles are specks (no legible plates, no people). Small tower and billboard signage is present but unreadable at 720p. |
| snow | Wietse van den Hout | https://www.pexels.com/video/aerial-footage-of-a-snow-covered-mountain-and-its-peaks-2110771/ | start 1.5 s, 8 s | `snow.f1859c8f16.mp4` (903 KB), `snow.f1859c8f16.webp` (80 KB) | Pass. Aerial snow-covered mountainside; no people, vehicles or signage. |
| beach | Alef Morais | https://www.pexels.com/video/aerial-drone-view-of-tropical-beach-coastline-39108740/ | start 2 s, 8 s | `beach.8c8f4a9aee.mp4` (1.05 MB), `beach.8c8f4a9aee.webp` (43 KB) | Pass. Aerial coastline; at most one or two distant specks on the sand, not identifiable. No signage. |

Total committed ambient payload: 4.38 MB of MP4 plus 0.21 MB of posters (cap: each MP4 <= 2.5 MB, each
poster <= 100 KB, total < 10 MB).

## Approved but not committed

| Scene | Author | Source | Reason |
|---|---|---|---|
| road | Dimitri Baret | https://www.pexels.com/video/point-of-view-of-a-car-driving-along-the-road-15330792/ | Cannot meet the size cap with the pipeline settings: the 3840x1620 in-car footage encodes to 4.51 MB for 8 s and 3.2 to 3.6 MB for 6 s at several start points (2.9 MB for 6 s even center-cropped to 16:9), over the 2.5 MB cap. Until it is solved (another road clip, a higher CRF, or a crop option in the pipeline) trips on the `road` scene keep the illustration. |
