import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contributing",
  description:
    "How to contribute to Elixpo, from finding good first issues to opening your first pull request in the open-source ecosystem.",
  alternates: { canonical: "/contributing" },
  openGraph: {
    title: "Contributing | Elixpo",
    description: "How to contribute to the Elixpo open-source ecosystem.",
  },
};

export default function ContributingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
