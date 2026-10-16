import { DISCUSSIONS_CONFIG, getLatestDiscussions } from "@/lib/discussions";
import { atomResponse, createAtomFeed, toAtomDate } from "@/lib/feeds";

export const dynamic = "force-static";

export async function GET() {
  const proposals = await getLatestDiscussions(30, "Chapter Proposal");
  const fallbackUpdated = toAtomDate(DISCUSSIONS_CONFIG.lastVerified);
  const entries = proposals.map((proposal) => ({
    id: proposal.url,
    url: proposal.url,
    title: proposal.title,
    summary: `Chapter proposal discussion by @${proposal.author}, with ${proposal.comments} public ${proposal.comments === 1 ? "comment" : "comments"}. Follow the canonical GitHub discussion for its current status and full record.`,
    updated: new Date(proposal.updatedAt).toISOString(),
    authors: [proposal.author],
    categories: [proposal.category, proposal.answered ? "answered" : "open"],
  }));

  return atomResponse(createAtomFeed({
    title: "Elixpo Chapter proposals",
    subtitle: "Moderated public proposals for time-bounded Elixpo Chapters, sourced from the canonical GitHub Discussions category.",
    path: "/chapter",
    updated: entries[0]?.updated ?? fallbackUpdated,
    entries,
  }));
}
