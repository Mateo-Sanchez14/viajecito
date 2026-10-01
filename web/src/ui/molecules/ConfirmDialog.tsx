"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "@/ui/atoms/Button";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Native modal <dialog>. Focus lands on the safe (cancel) action when it opens, the
 * browser traps focus and restores it on close, and Escape counts as cancelling.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(92vw,26rem)] rounded-2xl border border-border bg-surface p-6 text-foreground backdrop:bg-black/50"
    >
      <div className="flex flex-col gap-4">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        {description && <p className="text-sm text-muted">{description}</p>}
        <div className="flex justify-end gap-2">
          <Button ref={cancelRef} variant="link" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button className="w-auto!" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
