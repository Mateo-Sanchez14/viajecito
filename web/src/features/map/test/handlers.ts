import { createOpenApiHttp } from "openapi-msw";
import type { paths } from "@/shared/api/schema";
import type { MapProposal } from "../api/proposals";
const http = createOpenApiHttp<paths>({ baseUrl: globalThis.location.origin });
export const mapProposalsHandler = (proposals: MapProposal[]) =>
  http.get("/api/trips/{trip_id}/proposals", ({ response }) =>
    response(200).json(proposals),
  );
