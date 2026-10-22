import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "OreoOS Hardware and Software Hacks",
  description: "Follow practical OreoOS recipes for custom themes, Gallery media, IR quests, IMU controls, apps, OTA hosting, and badge hardware modifications.",
  path: "/hacks/",
  keywords: ["OreoOS hacks", "ESP32 projects", "MicroPython tutorials", "badge hacking"],
});

export default function HacksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
