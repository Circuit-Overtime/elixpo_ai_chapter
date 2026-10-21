import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Get Started with OreoOS",
  description: "Flash MicroPython, install OreoOS, configure your ESP32-S3 badge, and deploy your first build with this step-by-step setup guide.",
  path: "/get-started/",
  keywords: ["install OreoOS", "ESP32-S3 MicroPython setup", "build conference badge", "mpremote guide"],
});

export default function GetStartedLayout({ children }: { children: React.ReactNode }) {
  return children;
}
