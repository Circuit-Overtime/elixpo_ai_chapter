import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Send Files to an Oreo Badge",
  description: "Open the secure OreoOS transfer flow and send optimized photos, videos, Markdown, and text files to your badge over local Wi-Fi.",
  path: "/upload/",
  keywords: ["Oreo Badge upload", "send files to ESP32", "OreoOS file transfer"],
});

export default function UploadLayout({ children }: { children: React.ReactNode }) {
  return children;
}
