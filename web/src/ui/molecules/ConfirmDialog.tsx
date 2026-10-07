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
 * Native modal <dialog> sharing the sheet panel styles, centered at every width. Focus lands on
 * the safe (cancel) action when it opens, the browser traps focus and restores it on close, and
 * Escape counts as cancelling.
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
  const descriptionId = useId();

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
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="ui-sheet ui-sheet-centered"
    >
      <div className="ui-sheet-panel">
        <h2 id={titleId} className="ui-sheet-title">
          {title}
        </h2>
        {description && (
          <p id={descriptionId} className="text-sm text-muted">
            {description}
          </p>
        )}
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
