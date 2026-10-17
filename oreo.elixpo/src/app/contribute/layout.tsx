import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Contribute to OreoOS",
  description: "Contribute apps, firmware, documentation, artwork, hardware improvements, and bug fixes to the open-source OreoOS badge project.",
  path: "/contribute/",
  keywords: ["contribute to OreoOS", "open-source ESP32 project", "MicroPython contribution"],
});

export default function ContributeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
