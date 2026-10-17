import type { Metadata } from "next";
import Footer from "../components/footer";
import Navbar from "../components/navbar";
import TermsContent from "./content";

export const metadata: Metadata = {
    title: "Terms of Service",
    description:
        "The terms and legal agreements governing your use of Elixpo Accounts, the developer portal, webhook dispatch services, and OAuth integrations.",
    alternates: { canonical: "/terms" },
    openGraph: {
        url: "/terms",
        title: "Terms of Service — Elixpo Accounts",
        description:
            "The terms and legal agreements governing your use of Elixpo Accounts.",
        images: ["/og-image.png"],
    },
};

export default function TermsPage() {
    return (
        <div className="relative w-full min-h-screen font-body text-[#192837] bg-[#F2F2EE] selection:bg-[#7342E2] selection:text-white flex flex-col justify-between overflow-x-hidden">
            <style>{`
                .font-heading { font-family: var(--font-heading), sans-serif; }
                .font-body { font-family: var(--font-body), sans-serif; }
            `}</style>

            <Navbar />
            <TermsContent />
            <Footer />
        </div>
    );
}
