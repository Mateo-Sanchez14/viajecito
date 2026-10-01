import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { getTripServer } from "../api/trips.server";

/**
 * The request's trip (null on 404), fetched once per render pass: the trip layout and the
 * section pages under it share this cached call instead of hitting the api twice.
 */
export const loadTrip = cache(async (tripId: string) =>
  getTripServer((await cookies()).toString(), tripId),
);
