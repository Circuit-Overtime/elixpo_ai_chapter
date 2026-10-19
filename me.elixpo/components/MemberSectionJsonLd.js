import { buildMemberSectionJsonLd } from "@/lib/seo";

export default function MemberSectionJsonLd({ person, section }) {
  const jsonLd = buildMemberSectionJsonLd(person, section);
  if (!jsonLd) return null;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
      }}
    />
  );
}
