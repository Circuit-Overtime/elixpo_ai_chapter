/* Card-less, centered landing narrative below the pixel hero. Non-technical,
 * commercial tone with a reference to the public status page. */

import Link from "next/link";
import type { CSSProperties } from "react";

const wrap: CSSProperties = {
    position: "relative",
    zIndex: 1,
    maxWidth: 820,
    margin: "0 auto",
    padding: "0 1.5rem",
    textAlign: "center",
};

const eyebrow: CSSProperties = {
    display: "inline-block",
    fontSize: "0.72rem",
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "#b69aff",
};

const gradientText: CSSProperties = {
    background:
        "linear-gradient(135deg, #f5f5f4 0%, #9b7bf7 40%, #86efac 70%, #fbbf24 100%)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
};

export default function LandingSections({ authed }: { authed?: boolean }) {
    return (
        <div style={{ position: "relative", zIndex: 1, paddingBottom: "7rem" }}>
            {/* narrative */}
            <section style={{ ...wrap, paddingTop: "1rem" }}>
                <span style={eyebrow}>The Elixpo suite</span>
                <h2
                    style={{
                        fontSize: "clamp(2rem, 5vw, 3.4rem)",
                        fontWeight: 800,
                        letterSpacing: "-0.03em",
                        lineHeight: 1.1,
                        margin: "1rem 0 1.25rem",
                    }}
                >
                    Everything Elixpo runs on,
                    <br />
                    <span style={gradientText}>watched in one place.</span>
                </h2>
                <p
                    style={{
                        color: "rgba(245,245,244,0.7)",
                        fontSize: "clamp(1rem, 2.2vw, 1.18rem)",
                        lineHeight: 1.8,
                        maxWidth: 640,
                        margin: "0 auto",
                    }}
                >
                    Elixpo is a family of apps — your blog, your canvas, your
                    links, your payments and more — all sharing one account.
                    Behind the scenes, this is mission control: where our team
                    keeps every service fast, healthy and online so you never
                    have to think about it.
                </p>
            </section>

            {/* highlights — plain, centered, no cards */}
            <section style={{ ...wrap, marginTop: "4rem" }}>
                <div
                    style={{
                        display: "flex",
                        flexWrap: "wrap",
                        justifyContent: "center",
                        gap: "2.5rem 4rem",
                    }}
                >
                    {[
                        {
                            big: "Live",
                            small: "Real-time health across every product",
                        },
                        {
                            big: "Unified",
                            small: "One window for the whole platform",
                        },
                        {
                            big: "Open",
                            small: "Built in the open, issues welcome",
                        },
                    ].map((h) => (
                        <div key={h.big} style={{ maxWidth: 200 }}>
                            <div
                                style={{
                                    fontSize: "1.7rem",
                                    fontWeight: 800,
                                    ...gradientText,
                                }}
                            >
                                {h.big}
                            </div>
                            <div
                                style={{
                                    color: "rgba(245,245,244,0.6)",
                                    fontSize: "0.9rem",
                                    lineHeight: 1.6,
                                    marginTop: "0.4rem",
                                }}
                            >
                                {h.small}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* status reference */}
            <section style={{ ...wrap, marginTop: "4.5rem" }}>
                <p
                    style={{
                        color: "rgba(245,245,244,0.55)",
                        fontSize: "0.95rem",
                        marginBottom: "1.25rem",
                    }}
                >
                    Curious if everything's running? Anyone can check our live,
                    public status page.
                </p>
                <Link
                    href="https://status.elixpo.com"
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        height: 46,
                        padding: "0 24px",
                        borderRadius: 999,
                        fontWeight: 700,
                        fontSize: "0.9rem",
                        color: "#86efac",
                        textDecoration: "none",
                        background: "rgba(134,239,172,0.08)",
                        border: "1px solid rgba(134,239,172,0.3)",
                    }}
                >
                    <span
                        style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: "#86efac",
                            boxShadow: "0 0 10px #86efac",
                        }}
                    />
                    View live status
                </Link>
            </section>

            {/* final CTA */}
            <section style={{ ...wrap, marginTop: "4.5rem" }}>
                <h3
                    style={{
                        fontSize: "clamp(1.6rem, 4vw, 2.4rem)",
                        fontWeight: 800,
                        letterSpacing: "-0.02em",
                        margin: "0 0 1.5rem",
                    }}
                >
                    {authed
                        ? "Welcome back."
                        : "One identity, the whole suite."}
                </h3>
                <div
                    style={{
                        display: "flex",
                        gap: 12,
                        flexWrap: "wrap",
                        justifyContent: "center",
                    }}
                >
                    <a
                        href={authed ? "/dashboard" : "/api/auth/login"}
                        style={{
                            height: 50,
                            padding: "0 32px",
                            display: "inline-flex",
                            alignItems: "center",
                            borderRadius: 14,
                            fontWeight: 700,
                            color: "#fff",
                            textDecoration: "none",
                            background:
                                "linear-gradient(180deg, #a98cff 0%, #7c5cff 100%)",
                            boxShadow: "0 14px 30px rgba(124,92,255,0.35)",
                        }}
                    >
                        {authed ? "Open dashboard" : "Sign in with Elixpo"}
                    </a>
                    <a
                        href="https://elixpo.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            height: 50,
                            padding: "0 28px",
                            display: "inline-flex",
                            alignItems: "center",
                            borderRadius: 14,
                            fontWeight: 700,
                            color: "#f5f5f4",
                            textDecoration: "none",
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.14)",
                        }}
                    >
                        Visit elixpo.com
                    </a>
                </div>
            </section>
        </div>
    );
}
