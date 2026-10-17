import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Build an OreoOS App",
  description: "Learn the OreoOS app structure, lifecycle hooks, manifest format, drawing API, input model, assets, persistence, and badge deployment workflow.",
  path: "/docs/apps/",
  keywords: ["OreoOS app development", "MicroPython app tutorial", "ESP32 UI development"],
  type: "article",
});

export default function AppDocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
