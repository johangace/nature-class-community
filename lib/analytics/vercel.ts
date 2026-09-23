import type { BeforeSend } from "@vercel/analytics/next";
import { routePath } from "./events";

/** Aggregate page views only, using the same URL redaction as PostHog. */
export const redactVercelPageview: BeforeSend = (event) => {
  if (event.type !== "pageview") return null;
  try {
    const url = new URL(event.url);
    if (!["https:", "http:"].includes(url.protocol)) return null;
    return { ...event, url: `${url.origin}${routePath(url.pathname)}` };
  } catch {
    return null;
  }
};
