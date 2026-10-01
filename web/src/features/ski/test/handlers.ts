import { createOpenApiHttp } from "openapi-msw";
import type { components, paths } from "@/shared/api/schema";
import { makeOverview, makeProfile, makeReport, makeResort, RESORT_ID } from "./fixtures";

type Schemas = components["schemas"];

export const http = createOpenApiHttp<paths>({ baseUrl: globalThis.location.origin });

/** CSRF token endpoint: every unsafe request in a test needs it. */
export const csrfHandler = http.get("/api/auth/csrf", ({ response }) =>
  response(200).json({ csrf_token: "tok" }),
);

/**
 * `GET /api/trips/{id}/ski/conditions` with one resort and a fresh report. Exported for the
 * Today page tests (M4) as well; use `skiConditionsHandlerFor` for other data.
 */
export function skiConditionsHandlerFor(conditions: Schemas["SkiConditionsOut"]) {
  return http.get("/api/trips/{trip_id}/ski/conditions", ({ response }) => response(200).json(conditions));
}

export const skiConditionsHandler = skiConditionsHandlerFor({
  resorts: [{ resort_id: RESORT_ID, name: makeResort().name, latest_report: makeReport() }],
});

export function skiOverviewHandler(overview: Schemas["SkiOverviewOut"] = makeOverview()) {
  return http.get("/api/trips/{trip_id}/ski", ({ response }) => response(200).json(overview));
}

export function skiProfileHandler(profile: Schemas["SkiProfileOut"] = makeProfile()) {
  return http.get("/api/me/ski_profile", ({ response }) => response(200).json(profile));
}
