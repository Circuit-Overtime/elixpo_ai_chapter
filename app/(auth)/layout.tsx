import type { Metadata } from "next";
import Navbar from "../components/navbar";

export const metadata: Metadata = {
    robots: { index: false, follow: false },
};

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="relative min-h-screen bg-[var(--bg)] text-[var(--fg)] font-body selection:bg-[#ff7759] selection:text-white">
            <Navbar />
            <div className="relative z-10">{children}</div>
        </div>
    );
}
