import { BrandingContent, BRAND_DESCRIPTION } from "@/app/assets/page";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Elixpo branding, visual system, and social assets",
  description: BRAND_DESCRIPTION,
  path: "/branding",
});

export default function BrandingPage() {
  return <BrandingContent />;
}
