import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Code of Conduct",
  description:
    "The Elixpo community standards. We are committed to a welcoming, inclusive, and harassment-free experience for everyone.",
  alternates: { canonical: "/code-of-conduct" },
  openGraph: {
    title: "Code of Conduct | Elixpo",
    description: "Our community standards for a welcoming, inclusive experience.",
  },
};

export default function CodeOfConductLayout({ children }: { children: React.ReactNode }) {
  return children;
}
