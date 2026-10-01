"use client";

import type { TripCard } from "@/features/trips/cards/types";
import { InstallPrompt } from "./InstallPrompt";

/** Overview card (`order: 2`): the install offer. */
export const InstallCard: TripCard["Component"] = () => <InstallPrompt />;
