import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Oreo Badge Hardware",
  description: "Discover the open-source Oreo Badge: an ESP32-S3 conference badge with a 320×240 display, Wi-Fi, BLE, infrared, IMU, buttons, LEDs, and OreoOS.",
  path: "/badge/",
  keywords: ["ESP32-S3 badge", "open hardware badge", "conference badge", "MicroPython hardware"],
});

export default function BadgeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
