"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { ApiError } from "@/shared/api/errors";
import { Button } from "@/ui/atoms/Button";
import { CameraIcon, TrashIcon } from "@/ui/icons";
import { ConfirmDialog } from "@/ui/molecules/ConfirmDialog";
import { InlineError } from "@/ui/molecules/InlineError";
import { Sheet } from "@/ui/molecules/Sheet";
import { useClearCover, useSetCover } from "../hooks/useCover";
import { useTripContext } from "../TripProvider";

const KNOWN_ERRORS = ["file_too_large", "image_too_large", "unsupported_image", "network_error"] as const;
type CoverError = (typeof KNOWN_ERRORS)[number] | "failed";

/** The api `code` becomes copy; anything unexpected is the generic message (never the developer text). */
function coverError(error: unknown): CoverError {
  const code = error instanceof ApiError ? error.code : "";
  return (KNOWN_ERRORS as readonly string[]).includes(code) ? (code as CoverError) : "failed";
}

/**
 * Container: choose, replace or remove the trip photo. Without a cover the camera button opens the
 * file picker; with one it opens a small sheet (pick another / remove, the latter behind a
 * confirmation). A failed upload keeps the current cover and says why.
 */
export function CoverControl() {
  const t = useTranslations("trips.cover");
  const ui = useTranslations("ui");
  const { trip } = useTripContext();
  const input = useRef<HTMLInputElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<CoverError | null>(null);
  const setCover = useSetCover(trip.id, trip.crew_id);
  const clearCover = useClearCover(trip.id, trip.crew_id);
  const busy = setCover.isPending || clearCover.isPending;

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // picking the same file again must fire `change` again
    if (!file) return;
    setError(null);
    setCover.mutate(file, { onError: (failure) => setError(coverError(failure)) });
  }

  function openPicker() {
    setError(null);
    input.current?.click();
  }

  function remove() {
    setConfirmOpen(false);
    setError(null);
    clearCover.mutate(undefined, { onError: (failure) => setError(coverError(failure)) });
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={pick}
      />
      <Button
        variant="icon"
        aria-label={trip.has_cover ? t("change") : t("add")}
        aria-busy={busy}
        disabled={busy}
        onClick={() => (trip.has_cover ? setSheetOpen(true) : openPicker())}
      >
        <CameraIcon size={22} aria-hidden="true" />
      </Button>
      <span role="status" className="sr-only">
        {setCover.isPending ? t("uploading") : clearCover.isPending ? t("removing") : ""}
      </span>
      {error && <InlineError message={t(`errors.${error}`)} />}

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={t("sheetTitle")} closeLabel={ui("close")}>
        <Button
          variant="secondary"
          onClick={() => {
            setSheetOpen(false);
            openPicker();
          }}
        >
          <CameraIcon size={20} aria-hidden="true" />
          {t("choose")}
        </Button>
        <Button
          variant="destructive"
          onClick={() => {
            setSheetOpen(false);
            setConfirmOpen(true);
          }}
        >
          <TrashIcon size={20} aria-hidden="true" />
          {t("remove")}
        </Button>
      </Sheet>
      <ConfirmDialog
        open={confirmOpen}
        title={t("confirmTitle")}
        description={t("confirmDescription")}
        confirmLabel={t("confirmRemove")}
        cancelLabel={t("cancel")}
        onConfirm={remove}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
