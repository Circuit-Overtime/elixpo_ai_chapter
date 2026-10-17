import LandingSections from "@/components/landing-sections";
import PixelHero from "@/components/pixel-hero";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { cookies } from "next/headers";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function Home() {
    const store = await cookies();
    const session = await verifySession(store.get(SESSION_COOKIE)?.value);
    const authed = !!session?.isAdmin;

    return (
        <main
            style={{
                background:
                    "linear-gradient(180deg, #0b0d12 0%, #11151c 50%, #0b0d12 100%)",
                color: "#f5f5f4",
                minHeight: "100dvh",
            }}
        >
            <PixelHero authed={authed} />
            <LandingSections authed={authed} />
        </main>
    );
}
