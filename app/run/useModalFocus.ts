"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Keep a runner sheet keyboard-contained, close it with Escape, and return
 * attention to the control that opened it. The callback travels through a
 * ref so the one-second lesson clock cannot restart the focus effect.
 */
export function useModalFocus(
  open: boolean,
  dialogRef: RefObject<HTMLElement | null>,
  onClose: () => void
): void {
  const closeRef = useRef(onClose);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const focusable = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => !element.hasAttribute("hidden")
      );
    (focusable()[0] ?? dialog).focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    dialog.addEventListener("keydown", onKeyDown);
    return () => {
      dialog.removeEventListener("keydown", onKeyDown);
      returnFocusRef.current?.focus({ preventScroll: true });
      returnFocusRef.current = null;
    };
  }, [open, dialogRef]);
}
