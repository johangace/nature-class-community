"use client";

import { useState } from "react";
import { signOut } from "@/lib/auth-client";
import { PURGE_PRIVATE_CACHES } from "@/lib/sw-cache-policy";
import { isPrivateLocalStateKey } from "@/lib/run/private-local-state";
import { forgetActiveClass } from "./actions";
import { resetAnalytics } from "@/lib/analytics/client";
import { clearPreparedFieldData } from "@/lib/offline/prepared-store";
import { clearFieldRunState } from "@/lib/offline/field-run-state";

/**
 * The way out. A staffroom iPad is a shared device and the session lasts
 * thirty days, so a teacher must be able to hand the tablet on and know their
 * account went with them.
 *
 * Four things have to happen, in this order:
 *
 *   1. signOut() — the auth endpoint's own response is what clears the
 *      session cookies in this browser and revokes the session row. Calling
 *      it from the client is the only place that reliably does both.
 *   2. forgetActiveClass() — a server action drops the active-class cookie,
 *      which is ours, not Better Auth's, so nothing points at the last
 *      teacher's class.
 *   3. purgePrivateLocalState() + clearFieldRunState() + clearPreparedFieldData()
 *      — clear owner-scoped progress, the minimal local field taught mark, the
 *      prepared field overlay, pending completions, and any legacy held-question
 *      data from the shared device.
 *   4. purgeServiceWorkerCaches() — tell the service worker to drop the
 *      runtime caches, so a personalised page this teacher opened cannot be
 *      served offline to the next teacher on this iPad (issue #52). Bounded by
 *      a short timeout: a slow or missing worker must never trap the teacher on
 *      their way out.
 *   5. A full page load to /welcome, not a client-side push: a hard
 *      navigation drops the router's cached authenticated payloads instead of
 *      carrying them into the signed-out view.
 *
 * If any step fails we still leave: landing on /welcome with a stale cookie is
 * a worse outcome than a stuck button, so the navigation runs regardless.
 */

/** How long to wait for the worker to confirm the cache sweep before leaving. */
const PURGE_TIMEOUT_MS = 1500;

function purgePrivateLocalState(): void {
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key && isPrivateLocalStateKey(key)) window.localStorage.removeItem(key);
    }
  } catch {
    // A blocked store must not trap sign-out.
  }
}

/**
 * Ask the active service worker to sweep its private runtime caches and wait
 * for its acknowledgement. Resolves early on timeout, when no worker controls
 * the page, or on any error — the sweep is best-effort belt to the NetworkOnly
 * braces (personalised pages are not written to the cache in the first place),
 * so it must never block the sign-out from completing.
 */
async function purgeServiceWorkerCaches(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  const controller = navigator.serviceWorker.controller;
  if (!controller) return;

  await new Promise<void>((resolve) => {
    const done = () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
      clearTimeout(timer);
      resolve();
    };
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === `${PURGE_PRIVATE_CACHES}_DONE`) done();
    };
    const timer = setTimeout(done, PURGE_TIMEOUT_MS);
    navigator.serviceWorker.addEventListener("message", onMessage);
    try {
      controller.postMessage({ type: PURGE_PRIVATE_CACHES });
    } catch {
      done();
    }
  });
}

export function SignOutButton() {
  const [leaving, setLeaving] = useState(false);

  async function leave() {
    setLeaving(true);
    try {
      await signOut();
    } catch (err) {
      console.warn("[auth] session sign-out did not complete cleanly", err);
    }
    try {
      await forgetActiveClass();
    } catch (err) {
      console.warn("[auth] active class could not be forgotten cleanly", err);
    }
    purgePrivateLocalState();
    clearFieldRunState();
    try {
      await clearPreparedFieldData();
    } catch (err) {
      console.warn("[auth] prepared field data could not be cleared cleanly", err);
    }
    // Belt to the braces: analytics keeps its identity in memory only, so the
    // hard navigation below already loses it. This is here because that is a
    // configuration choice rather than a law, and on a shared staffroom iPad
    // the sign-out path must already be correct on the day someone turns
    // persistence on to chase a funnel.
    resetAnalytics();
    try {
      await purgeServiceWorkerCaches();
    } catch (err) {
      console.warn("[auth] private cache purge did not complete cleanly", err);
    } finally {
      window.location.replace("/welcome");
    }
  }

  return (
    <button
      type="button"
      className="account-signout"
      onClick={leave}
      disabled={leaving}
    >
      {leaving ? "Signing out…" : "Sign out"}
    </button>
  );
}
