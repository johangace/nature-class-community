"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./public-header.module.css";

export function MobileMenu({ brand, children }: { brand: ReactNode; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const desktop = window.matchMedia("(min-width: 761px)");
    const resize = () => { if (desktop.matches) dialog.current?.close(); };
    desktop.addEventListener("change", resize);
    return () => {
      document.body.style.overflow = previous;
      desktop.removeEventListener("change", resize);
    };
  }, [open]);

  return <div className={styles.mobile}>
    <button ref={trigger} className={styles.menuButton} aria-label="Open menu" aria-expanded={open} aria-controls="public-mobile-menu" onClick={() => { dialog.current?.showModal(); setOpen(true); }}>
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true"><path d="M3 6h20M3 13h20M3 20h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
    </button>
    <dialog id="public-mobile-menu" ref={dialog} className={styles.mobileDialog} aria-label="Navigation menu" onClose={() => { setOpen(false); trigger.current?.focus(); }} onClick={event => { if ((event.target as HTMLElement).closest("a")) dialog.current?.close(); }}>
      <div className={styles.menuTop}>{brand}<button autoFocus className={styles.menuButton} aria-label="Close menu" onClick={() => dialog.current?.close()}><svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true"><path d="m6 6 14 14M20 6 6 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button></div>
      <div className={styles.menuContent}>{children}</div>
    </dialog>
  </div>;
}
