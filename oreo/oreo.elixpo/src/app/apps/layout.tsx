import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "App Library",
  description: "Explore the open-source apps, games, hardware tools, Gallery, file transfer, OTA updates, and on-device app store included with OreoOS.",
  path: "/apps/",
  keywords: ["OreoOS apps", "ESP32-S3 apps", "MicroPython games", "embedded app store"],
});

export default function AppsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
