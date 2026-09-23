"use client";

import { Analytics } from "@vercel/analytics/next";
import { redactVercelPageview } from "@/lib/analytics/vercel";

export function VercelAnalytics() {
  return <Analytics beforeSend={redactVercelPageview} debug={false} />;
}
