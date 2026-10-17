"use client";

import { useEffect } from "react";

type PortalEvent =
  | "adoption_click"
  | "discussion_participation"
  | "package_access"
  | "research_artifact_access"
  | "task_claim";

type AnalyticsWindow = Window & {
  zaraz?: { track: (event: string, properties: Record<string, string | boolean>) => void };
};

type PrivacyNavigator = Navigator & { globalPrivacyControl?: boolean };

function classify(anchor: HTMLAnchorElement, destination: URL): PortalEvent | null {
  const declared = anchor.dataset.analyticsEvent as PortalEvent | undefined;
  if (declared) return declared;

  const target = `${destination.hostname}${destination.pathname}`.toLowerCase();
  if (target.includes("github.com/orgs/elixpo/discussions")) return "discussion_participation";
  if (target.includes("github.com/") && /\/issues(?:\/new)?\/?$/.test(destination.pathname)) return "task_claim";
  if (
    target.includes("npmjs.com/package/") ||
    target.includes("packages.elixpo.com") ||
    destination.pathname.startsWith("/packages/")
  ) return "package_access";
  if (
    target.includes("doi.org/") ||
    target.includes("zenodo.org/") ||
    target.includes("huggingface.co/") ||
    target.includes("arxiv.org/") ||
    destination.pathname.startsWith("/research/")
  ) return "research_artifact_access";
  if (destination.pathname.startsWith("/projects/") || destination.pathname.startsWith("/services/")) {
    return "adoption_click";
  }
  return null;
}

/**
 * Records only high-level public-action categories. It uses no cookies,
 * persistent identifier, query string, referrer, profile handle, or free-form
 * field. Do Not Track and Global Privacy Control disable collection entirely.
 */
export function PortalAnalytics() {
  useEffect(() => {
    const privacyNavigator = navigator as PrivacyNavigator;
    if (navigator.doNotTrack === "1" || privacyNavigator.globalPrivacyControl) return;

    const record = (event: MouseEvent) => {
      if (event.button !== 0 || event.defaultPrevented) return;
      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;

      const destination = new URL(anchor.href, window.location.href);
      const action = classify(anchor, destination);
      if (!action) return;

      const properties = {
        action,
        route: window.location.pathname,
        destination_host: destination.hostname,
        outbound: destination.origin !== window.location.origin,
        surface: anchor.dataset.analyticsSurface ?? "portal",
      };

      (window as AnalyticsWindow).zaraz?.track("elixpo_public_action", properties);

      const configuredEndpoint = process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT;
      if (!configuredEndpoint) return;
      const endpoint = new URL(configuredEndpoint, window.location.origin);
      if (endpoint.origin !== window.location.origin) return;
      navigator.sendBeacon(
        endpoint,
        new Blob([JSON.stringify(properties)], { type: "application/json" }),
      );
    };

    document.addEventListener("click", record, { capture: true });
    return () => document.removeEventListener("click", record, { capture: true });
  }, []);

  return null;
}
