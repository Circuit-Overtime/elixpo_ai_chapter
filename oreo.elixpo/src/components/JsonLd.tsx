type JsonLdProps = {
  data: Record<string, unknown>;
};

/** Serialize trusted, build-time schema.org data without enabling HTML input. */
export default function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
