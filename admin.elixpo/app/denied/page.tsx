import BackgroundAurora from "@/components/background-aurora";
import Link from "next/link";

export const runtime = "edge";

const REASONS: Record<string, string> = {
    not_admin:
        "Your Elixpo account isn't marked as an admin yet. Request access below and an existing admin will review it.",
    bad_state:
        "The sign-in request expired or was tampered with. Please try again.",
    exchange_failed:
        "We couldn't complete sign-in with Elixpo Accounts. Please try again.",
    no_profile: "We couldn't read your Elixpo profile. Please try again.",
    access_denied: "You declined the sign-in request.",
};

const REPO = "https://github.com/Circuit-Overtime/admin.elixpo";
const issueUrl = () => {
    const title = "Admin access request — admin.elixpo";
    const body = [
        "### Admin access request",
        "",
        "**Elixpo account email:** <your email>",
        "**Why you need access:** <short reason>",
        "**Which areas:** <e.g. traffic, D1, payouts>",
        "",
        "_Submitted from admin.elixpo/denied._",
    ].join("\n");
    return `${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=access-request`;
};

const btn = (primary?: boolean) => ({
    height: 46,
    padding: "0 24px",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    fontWeight: 700,
    fontSize: "0.9rem",
    textDecoration: "none",
    ...(primary
        ? {
              color: "#fff",
              background: "linear-gradient(180deg, #a98cff 0%, #7c5cff 100%)",
              boxShadow: "0 14px 30px rgba(124,92,255,0.35)",
          }
        : {
              color: "#f5f5f4",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.14)",
          }),
});

export default async function Denied({
    searchParams,
}: {
    searchParams: Promise<{ reason?: string }>;
}) {
    const { reason } = await searchParams;
    const message =
        (reason && REASONS[reason]) ||
        "You don't have access to the Elixpo Admin console.";

    return (
        <main
            style={{
                position: "relative",
                minHeight: "100dvh",
                color: "#f5f5f4",
                overflow: "hidden",
            }}
        >
            <BackgroundAurora variant="warm" />
            <div
                style={{
                    position: "relative",
                    zIndex: 1,
                    minHeight: "100dvh",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    padding: "2rem",
                }}
            >
                <div
                    style={{
                        maxWidth: 520,
                        width: "100%",
                        padding: "2.5rem 2rem",
                        borderRadius: 20,
                        background: "rgba(18,21,32,0.55)",
                        backdropFilter: "blur(18px)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
                    }}
                >
                    <div
                        style={{
                            display: "inline-block",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            color: "#f87171",
                            background: "rgba(239,68,68,0.12)",
                            border: "1px solid rgba(239,68,68,0.3)",
                            borderRadius: 999,
                            padding: "5px 13px",
                            marginBottom: "1.25rem",
                        }}
                    >
                        Access denied
                    </div>
                    <h1
                        style={{
                            fontSize: "clamp(1.9rem, 5vw, 2.6rem)",
                            fontWeight: 800,
                            margin: "0 0 0.75rem",
                            letterSpacing: "-0.02em",
                        }}
                    >
                        Admins only
                    </h1>
                    <p
                        style={{
                            color: "rgba(245,245,244,0.7)",
                            lineHeight: 1.65,
                            margin: "0 0 1.75rem",
                            fontSize: "0.98rem",
                        }}
                    >
                        {message}
                    </p>

                    <div
                        style={{
                            display: "flex",
                            gap: 10,
                            flexWrap: "wrap",
                            justifyContent: "center",
                        }}
                    >
                        <a
                            href={issueUrl()}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={btn(true)}
                        >
                            Request admin access
                        </a>
                        <a href="/api/auth/login" style={btn()}>
                            Try again
                        </a>
                    </div>

                    <div
                        style={{
                            display: "flex",
                            gap: 10,
                            flexWrap: "wrap",
                            justifyContent: "center",
                            marginTop: 12,
                        }}
                    >
                        <Link href="/" style={btn()}>
                            Back to home
                        </Link>
                        <a
                            href="https://elixpo.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={btn()}
                        >
                            Visit elixpo.com
                        </a>
                    </div>

                    <p
                        style={{
                            color: "rgba(245,245,244,0.4)",
                            fontSize: "0.74rem",
                            marginTop: "1.75rem",
                        }}
                    >
                        Requesting access opens a pre-filled issue on GitHub —
                        an admin will review it.
                    </p>
                </div>
            </div>
        </main>
    );
}
