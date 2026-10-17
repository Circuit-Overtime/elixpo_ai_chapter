/**
 * Instant skeleton shown while the root status page fetches live data from
 * Cloudflare. Next streams this fallback immediately (Suspense boundary), then
 * swaps in the real page once discovery + analytics resolve. Plain CSS so it
 * renders with zero client JS.
 */

const C = {
    bg: "#f7f7f2",
    card: "#ffffff",
    border: "#d9ddd8",
    bone: "#e3e7e2",
};

const shimmer: React.CSSProperties = {
    background: C.bone,
    borderRadius: 8,
    animation: "elxpulse 1.5s ease-in-out infinite",
};

function Bars() {
    return (
        <div style={{ display: "flex", gap: 2, height: 34, marginTop: 12 }}>
            {Array.from({ length: 24 }, (_, i) => `bar-${i}`).map((key, i) => (
                <div
                    key={key}
                    style={{
                        flex: 1,
                        borderRadius: 2,
                        background: C.bone,
                        animation: "elxpulse 1.5s ease-in-out infinite",
                        animationDelay: `${(i % 12) * 0.06}s`,
                    }}
                />
            ))}
        </div>
    );
}

function Card() {
    return (
        <div
            style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: 20,
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                }}
            >
                <div style={{ ...shimmer, width: 150, height: 16 }} />
                <div style={{ ...shimmer, width: 90, height: 14 }} />
            </div>
            <Bars />
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: 10,
                }}
            >
                <div style={{ ...shimmer, width: 70, height: 11 }} />
                <div style={{ ...shimmer, width: 90, height: 11 }} />
                <div style={{ ...shimmer, width: 50, height: 11 }} />
            </div>
        </div>
    );
}

export default function Loading() {
    return (
        <div style={{ minHeight: "100dvh", background: C.bg }}>
            <style>
                {"@keyframes elxpulse{0%,100%{opacity:1}50%{opacity:.45}}"}
            </style>
            <div
                style={{
                    maxWidth: 1180,
                    margin: "0 auto",
                    padding: "32px 24px 64px",
                }}
            >
                {/* header */}
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        minHeight: 68,
                        padding: "8px 16px",
                        marginBottom: 28,
                        border: `1px solid ${C.border}`,
                        borderRadius: 999,
                        background: C.card,
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                        }}
                    >
                        <div
                            style={{
                                ...shimmer,
                                width: 30,
                                height: 30,
                                borderRadius: 7,
                            }}
                        />
                        <div style={{ ...shimmer, width: 150, height: 22 }} />
                    </div>
                    <div
                        style={{
                            ...shimmer,
                            width: 150,
                            height: 38,
                            borderRadius: 999,
                        }}
                    />
                </div>

                <div
                    style={{
                        ...shimmer,
                        height: 430,
                        borderRadius: 30,
                        marginBottom: 16,
                    }}
                />

                <div
                    style={{
                        ...shimmer,
                        height: 92,
                        borderRadius: 18,
                        marginBottom: 48,
                    }}
                />

                {/* services */}
                <div
                    style={{
                        ...shimmer,
                        width: 80,
                        height: 14,
                        marginBottom: 12,
                    }}
                />
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns:
                            "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
                        gap: 12,
                    }}
                >
                    {["one", "two", "three", "four", "five", "six"].map(
                        (key) => (
                            <Card key={key} />
                        ),
                    )}
                </div>
            </div>
        </div>
    );
}
