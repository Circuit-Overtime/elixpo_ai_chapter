"use client";

interface SourcePillProps {
  sourceLink: string;
}

export default function SourcePill({ sourceLink }: SourcePillProps) {
  let domain = "";
  try {
    const urlObj = new URL(sourceLink);
    domain = urlObj.hostname.replace(/^www\./, "");
  } catch {
    domain = sourceLink;
  }

  const logoUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

  return (
    <div
      onClick={() => window.open(sourceLink, "_blank")}
      className="relative flex items-center justify-center h-10 pl-[38px] pr-3 rounded-full cursor-pointer transition-all duration-300 font-[var(--font-parkinsans)] font-bold"
      style={{ background: "rgb(38, 37, 39)" }}
    >
      <div
        className="absolute left-5 w-7 h-7 rounded-full bg-cover bg-center"
        style={{ backgroundImage: `url('${logoUrl}')` }}
      />
      <span className="ml-4 text-sm font-bold text-white uppercase truncate font-[family-name:var(--font-parkinsans)]">
        {domain.split(".")[0]}
      </span>
    </div>
  );
}
