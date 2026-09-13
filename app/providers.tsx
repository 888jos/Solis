"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

const convexUrl = import.meta.env.VITE_CONVEX_URL;
const convexClient = convexUrl ? new ConvexReactClient(convexUrl) : null;

export const isConvexConfigured = Boolean(convexClient);

export function AppProviders({ children }: { children: ReactNode }) {
  return convexClient
    ? <ConvexProvider client={convexClient}>{children}</ConvexProvider>
    : children;
}
