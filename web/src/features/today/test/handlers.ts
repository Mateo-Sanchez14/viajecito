import { http, HttpResponse } from "msw";
import { makeToday } from "@/features/itinerary/test/handlers";
import type { Today } from "@/features/itinerary/api/itinerary";
export const todayHandler = (value: Today = makeToday()) =>
  http.get("*/api/trips/:tripId/today", () =>
    HttpResponse.json(value, { headers: { ETag: 'W/"today"' } }),
  );
export const documentsHandler = http.get("*/api/trips/:tripId/documents", () =>
  HttpResponse.json([
    {
      id: "ticket",
      trip_id: "trip",
      title: "Flight ticket",
      kind: "ticket",
      download_path: "/api/documents/ticket/file",
    },
  ]),
);
export const snowHandler = http.get("*/api/trips/:tripId/ski/conditions", () =>
  HttpResponse.json({
    resorts: [
      {
        resort_id: "resort",
        name: "Cerro",
        latest_report: {
          base_cm: 50,
          new_24h_cm: 5,
          stale: true,
          age_hours: 8,
        },
      },
    ],
  }),
);
