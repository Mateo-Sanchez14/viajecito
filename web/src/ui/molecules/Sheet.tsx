"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "@/ui/atoms/Button";
import { XIcon } from "@/ui/icons";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Accessible name of the close button. */
  closeLabel: string;
  description?: string;
  children: ReactNode;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Native modal <dialog>: bottom sheet on phones, centered panel from md up. The browser traps
 * focus and keeps the page inert; Escape and a click on the backdrop both ask the owner to close
 * through `onClose`. Children are mounted only while open, so a closed sheet adds nothing to
 * the page. Focus lands on the first control of the content and returns to the opener on close.
 */
export function Sheet({ open, onClose, title, closeLabel, description, children }: SheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      (bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE) ?? closeRef.current)?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      const opener = openerRef.current;
      openerRef.current = null;
      if (opener?.isConnected) opener.focus();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className="ui-sheet"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        // The browser closed it on its own (not through the `open` prop): keep the owner in sync.
        if (open) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open && (
        <div className="ui-sheet-panel">
          <div className="ui-sheet-header">
            <h2 id={titleId} className="ui-sheet-title">
              {title}
            </h2>
            <Button ref={closeRef} variant="icon" aria-label={closeLabel} onClick={onClose}>
              <XIcon size={20} aria-hidden="true" />
            </Button>
          </div>
          {description && (
            <p id={descriptionId} className="text-sm text-muted">
              {description}
            </p>
          )}
          <div ref={bodyRef} className="ui-sheet-body">
            {children}
          </div>
        </div>
      )}
    </dialog>
  );
}
