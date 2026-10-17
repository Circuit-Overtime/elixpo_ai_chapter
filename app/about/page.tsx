import type { Metadata } from "next";
import AboutClient from "./AboutClient";

export const runtime = "edge";

export const metadata: Metadata = {
    title: "About Our Authentication Platform",
    description:
        "Learn how Elixpo Accounts provides edge-hosted authentication, OAuth 2.0, OpenID Connect, passkeys, SSO, and user management for any application.",
    alternates: { canonical: "/about" },
    openGraph: {
        url: "/about",
        title: "About the Elixpo Accounts Authentication Platform",
        description:
            "Edge-hosted authentication, OAuth/OIDC, passkeys, SSO, and user management for any application.",
        images: [
            {
                url: "/og-image.png",
                width: 1280,
                height: 720,
                alt: "About Elixpo Accounts",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "About the Elixpo Accounts Authentication Platform",
        description:
            "Edge-hosted authentication, OAuth/OIDC, passkeys, SSO, and user management for any application.",
        images: ["/og-image.png"],
    },
};

export default function AboutPage() {
    return <AboutClient />;
}
