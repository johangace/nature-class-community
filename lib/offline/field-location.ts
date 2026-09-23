"use client";

import { useEffect, useState } from "react";

export type FieldView = "lesson" | "run" | "primer" | "safety";
export type FieldHomeHref = "/" | "/today";

export function fieldHomeHref(
  value: string | null | undefined,
  pathname?: string,
): FieldHomeHref {
  // A failed navigation to /today is answered by the service worker's /field
  // shell while the browser keeps /today in its address bar. There is no hash
  // token on that direct request, so retain the teacher destination from the
  // original pathname. All other values remain an allowlist, not a redirect.
  return value === "today" || pathname === "/today" ? "/today" : "/";
}

export function fieldRootHref(homeHref: FieldHomeHref = "/"): string {
  return homeHref === "/today" ? "/field#home=today" : "/field";
}

export function asFieldView(value: string | null): FieldView {
  return value === "run" || value === "primer" || value === "safety"
    ? value
    : "lesson";
}

export function fieldHref(
  sessionId: string,
  view: FieldView = "lesson",
  homeHref: FieldHomeHref = "/",
): string {
  const state = new URLSearchParams({ session: sessionId });
  if (view !== "lesson") state.set("view", view);
  if (homeHref === "/today") state.set("home", "today");
  return `/field#${state.toString()}`;
}

export function fieldPrintHref(
  sessionId: string,
  homeHref: FieldHomeHref = "/",
): string {
  const state = new URLSearchParams({ session: sessionId });
  if (homeHref === "/today") state.set("home", "today");
  return `/field/print#${state.toString()}`;
}

/**
 * Hash state survives a service-worker HTML fallback because it never travels
 * to the server. That makes it the reliable address for a selected lesson or
 * view when the device has no network. Query parameters remain readable as a
 * compatibility path, but new field links use this state.
 */
export function useFieldHashParams(): URLSearchParams {
  const [params, setParams] = useState(() => new URLSearchParams());

  useEffect(() => {
    const update = () => setParams(new URLSearchParams(window.location.hash.slice(1)));
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  return params;
}
