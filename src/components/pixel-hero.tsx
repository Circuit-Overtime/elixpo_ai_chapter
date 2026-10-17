"use client";

import Link from "next/link";
import {
    type CSSProperties,
    type ReactNode,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";

/* -----------------------------------------------------------------------------
 * Staggered pixel-field physics engine (vanilla canvas — no deps).
 * Verbatim from accounts.elixpo's hero so the admin landing matches the suite.
 * -------------------------------------------------------------------------- */

type Pixel = {
    x: number;
    y: number;
    color: string;
    size: number;
    sizeStep: number;
    minSize: number;
    maxSizeInt: number;
    maxSize: number;
    delay: number;
    counter: number;
    counterStep: number;
    speed: number;
    isIdle: boolean;
    isReverse: boolean;
    isShimmer: boolean;
    draw: () => void;
    appear: () => void;
};

function createPixel(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    x: number,
    y: number,
    color: string,
    baseSpeed: number,
    delay: number,
): Pixel {
    const rand = (min: number, max: number) =>
        Math.random() * (max - min) + min;
    const p: Pixel = {
        x,
        y,
        color,
        size: 0,
        sizeStep: rand(0.12, 0.28),
        minSize: 0.5,
        maxSizeInt: 2,
        maxSize: rand(0.5, 2),
        delay,
        counter: 0,
        counterStep: rand(1.8, 3.2) + (canvas.width + canvas.height) * 0.008,
        speed: rand(0.08, 0.4) * baseSpeed,
        isIdle: false,
        isReverse: false,
        isShimmer: false,
        draw() {
            const offset = p.maxSizeInt * 0.5 - p.size * 0.5;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x + offset, p.y + offset, p.size, p.size);
        },
        appear() {
            p.isIdle = false;
            if (p.counter <= p.delay) {
                p.counter += p.counterStep;
                return;
            }
            if (p.size >= p.maxSize) p.isShimmer = true;
            if (p.isShimmer) {
                if (p.size >= p.maxSize) p.isReverse = true;
                else if (p.size <= p.minSize) p.isReverse = false;
                p.size += p.isReverse ? -p.speed : p.speed;
            } else {
                p.size += p.sizeStep;
            }
            p.draw();
        },
    };
    return p;
}

function PixelCanvas({ colors, gap = 6 }: { colors: string[]; gap?: number }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const pixelsRef = useRef<Pixel[]>([]);
    const rafRef = useRef<number>(0);
    const lastRef = useRef(0);
    const reducedRef = useRef(false);

    const init = useCallback(() => {
        const canvas = canvasRef.current;
        const wrap = wrapRef.current;
        if (!canvas || !wrap || colors.length === 0) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const { width, height } = wrap.getBoundingClientRect();
        const w = Math.floor(width);
        const h = Math.floor(height);
        canvas.width = w;
        canvas.height = h;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;

        const speed = reducedRef.current ? 0 : 30 * 0.001;
        const pixels: Pixel[] = [];
        for (let x = 0; x < w; x += gap) {
            for (let y = 0; y < h; y += gap) {
                const color = colors[Math.floor(Math.random() * colors.length)];
                const dx = x - w / 2;
                const dy = y - h / 2;
                const delay = reducedRef.current
                    ? 0
                    : Math.sqrt(dx * dx + dy * dy) * 0.65;
                pixels.push(
                    createPixel(ctx, canvas, x, y, color, speed, delay),
                );
            }
        }
        pixelsRef.current = pixels;
    }, [colors, gap]);

    const animate = useCallback(() => {
        cancelAnimationFrame(rafRef.current);
        const frameInterval = 1000 / 60;
        const loop = () => {
            rafRef.current = requestAnimationFrame(loop);
            const now = performance.now();
            const elapsed = now - lastRef.current;
            if (elapsed < frameInterval) return;
            lastRef.current = now - (elapsed % frameInterval);

            const canvas = canvasRef.current;
            const ctx = canvas?.getContext("2d");
            if (!canvas || !ctx) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (const pixel of pixelsRef.current) pixel.appear();
            if (pixelsRef.current.every((p) => p.isIdle))
                cancelAnimationFrame(rafRef.current);
        };
        rafRef.current = requestAnimationFrame(loop);
    }, []);

    useEffect(() => {
        reducedRef.current = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;
        init();
        const ro = new ResizeObserver(() => init());
        if (wrapRef.current) ro.observe(wrapRef.current);
        animate();
        return () => {
            ro.disconnect();
            cancelAnimationFrame(rafRef.current);
        };
    }, [init, animate]);

    return (
        <div
            ref={wrapRef}
            style={{ position: "absolute", inset: 0, overflow: "hidden" }}
        >
            <canvas
                ref={canvasRef}
                style={{ display: "block", width: "100%", height: "100%" }}
            />
        </div>
    );
}

/* -----------------------------------------------------------------------------
 * Hero
 * -------------------------------------------------------------------------- */

const PIXELS = [
    "rgba(245,245,244,0.16)",
    "rgba(245,245,244,0.16)",
    "rgba(245,245,244,0.10)",
    "#9b7bf7",
    "#7c5cff",
];

const wordmark: CSSProperties = {
    fontFamily: "var(--font-geist-sans), sans-serif",
    fontWeight: 800,
    fontSize: "1.35rem",
    letterSpacing: "-0.01em",
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    opacity: 0.95,
    lineHeight: 1,
};
const tint = (color: string): CSSProperties => ({ ...wordmark, color });

const ELIXPO_PRODUCTS: { name: string; node: ReactNode }[] = [
    {
        name: "Elixpo",
        node: (
            <span style={wordmark}>
                <b style={{ color: "#f5f5f4" }}>Elix</b>
                <b style={{ color: "#9b7bf7" }}>po</b>
            </span>
        ),
    },
    { name: "Blogs", node: <span style={tint("#5fb6ff")}>Blogs</span> },
    { name: "Sketch", node: <span style={tint("#86efac")}>Sketch</span> },
    {
        name: "URL",
        node: (
            <span
                style={{
                    ...tint("rgba(245,245,244,0.85)"),
                    letterSpacing: "0.04em",
                }}
            >
                URL
            </span>
        ),
    },
    { name: "Payouts", node: <span style={tint("#fbbf24")}>Payouts</span> },
    { name: "Mails", node: <span style={tint("#9b7bf7")}>Mails</span> },
    { name: "Me", node: <span style={tint("#ff6a8a")}>Me</span> },
    { name: "Art", node: <span style={tint("#5ac8fa")}>Art</span> },
];

const ArrowRight = () => (
    <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
    >
        <path
            d="M5 12h14M13 6l6 6-6 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

export default function PixelHero({ authed }: { authed?: boolean }) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setMounted(true), 50);
        return () => clearTimeout(t);
    }, []);
    const primaryHref = authed ? "/dashboard" : "/api/auth/login";
    const primaryLabel = authed ? "Open dashboard" : "Sign in with Elixpo";

    return (
        <section
            style={{
                position: "relative",
                width: "100%",
                minHeight: "100dvh",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                overflow: "hidden",
                isolation: "isolate",
                padding: "2rem 1rem 5.5rem",
                textAlign: "center",
            }}
        >
            <style>{`
                @keyframes pay-marquee { 0% { transform: translateX(0%); } 100% { transform: translateX(-50%); } }
                .pay-marquee { animation: pay-marquee 26s linear infinite; }
                @keyframes pay-rise { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>

            {/* pixel field + vignette */}
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 0,
                    pointerEvents: "none",
                }}
            >
                <PixelCanvas colors={PIXELS} gap={7} />
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        background:
                            "radial-gradient(circle at 50% 42%, transparent 0%, rgba(11,13,18,0.5) 62%, #0b0d12 100%)",
                    }}
                />
                <div
                    style={{
                        position: "absolute",
                        top: "30%",
                        left: "50%",
                        width: "60vmax",
                        height: "40vmax",
                        transform: "translate(-50%, -50%)",
                        background:
                            "radial-gradient(circle, rgba(155,123,247,0.16) 0%, transparent 60%)",
                        filter: "blur(40px)",
                    }}
                />
            </div>

            {/* eyebrow */}
            <div
                style={{
                    position: "relative",
                    zIndex: 1,
                    opacity: mounted ? 1 : 0,
                    animation: mounted ? "pay-rise 0.7s ease both" : undefined,
                    marginBottom: "1.4rem",
                }}
            >
                <span
                    style={{
                        display: "inline-block",
                        padding: "6px 14px",
                        borderRadius: 999,
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        color: "#b69aff",
                        background: "rgba(155,123,247,0.1)",
                        border: "1px solid rgba(155,123,247,0.25)",
                        backdropFilter: "blur(8px)",
                    }}
                >
                    Admin control plane · admins only
                </span>
            </div>

            {/* headline — serif italic + sans extrabold gradient */}
            <h1
                style={{
                    position: "relative",
                    zIndex: 1,
                    margin: 0,
                    lineHeight: 1.0,
                    letterSpacing: "-0.03em",
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    gap: "0 0.4em",
                    fontSize: "clamp(2.8rem, 8vw, 6rem)",
                    opacity: mounted ? 1 : 0,
                    animation: mounted
                        ? "pay-rise 0.8s ease 0.05s both"
                        : undefined,
                }}
            >
                <span
                    style={{
                        fontFamily: "Georgia, 'Times New Roman', serif",
                        fontStyle: "italic",
                        fontWeight: 500,
                        color: "rgba(245,245,244,0.92)",
                        textShadow: "0 12px 40px rgba(0,0,0,0.5)",
                    }}
                >
                    One
                </span>
                <span
                    style={{
                        fontWeight: 800,
                        background:
                            "linear-gradient(135deg, #f5f5f4 0%, #9b7bf7 38%, #86efac 68%, #fbbf24 100%)",
                        WebkitBackgroundClip: "text",
                        backgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                    }}
                >
                    console.
                </span>
            </h1>

            {/* subhead */}
            <p
                style={{
                    position: "relative",
                    zIndex: 1,
                    maxWidth: 600,
                    margin: "1.7rem auto 0",
                    fontSize: "clamp(1rem, 2.4vw, 1.16rem)",
                    lineHeight: 1.7,
                    color: "rgba(245,245,244,0.72)",
                    opacity: mounted ? 1 : 0,
                    animation: mounted
                        ? "pay-rise 0.8s ease 0.15s both"
                        : undefined,
                }}
            >
                The admin control plane for the entire Elixpo Cloudflare account
                — every Pages project, Worker, D1, KV, Queue, Durable Object and
                Workflow, auto-discovered with full observability. Admins only.
            </p>

            {/* CTAs — Tahoe glass buttons */}
            <div
                style={{
                    position: "relative",
                    zIndex: 1,
                    display: "flex",
                    gap: 12,
                    marginTop: "2.2rem",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    opacity: mounted ? 1 : 0,
                    transform: mounted ? "translateY(0)" : "translateY(24px)",
                    transition: "opacity 0.8s ease, transform 0.8s ease",
                    transitionDelay: "0.35s",
                }}
            >
                <a
                    href={primaryHref}
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        height: 50,
                        padding: "0 30px",
                        borderRadius: 14,
                        fontSize: "0.95rem",
                        fontWeight: 700,
                        color: "#fff",
                        textDecoration: "none",
                        background:
                            "linear-gradient(180deg, #a98cff 0%, #7c5cff 100%)",
                        boxShadow:
                            "inset 0 1px 1px rgba(255,255,255,0.3), 0 2px 4px rgba(0,0,0,0.2), 0 14px 30px rgba(124,92,255,0.35)",
                    }}
                >
                    {primaryLabel}
                    <ArrowRight />
                </a>
                <Link
                    href="https://status.elixpo.com"
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        height: 50,
                        padding: "0 28px",
                        borderRadius: 14,
                        fontSize: "0.95rem",
                        fontWeight: 700,
                        color: "#f5f5f4",
                        textDecoration: "none",
                        background:
                            "linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.04) 100%)",
                        border: "1px solid rgba(255,255,255,0.14)",
                        backdropFilter: "blur(12px)",
                        boxShadow: "inset 0 1px 1px rgba(255,255,255,0.1)",
                    }}
                >
                    Live status
                </Link>
            </div>

            {/* powered-by marquee */}
            <div
                style={{
                    position: "absolute",
                    bottom: "2rem",
                    left: 0,
                    right: 0,
                    zIndex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 14,
                    opacity: mounted ? 1 : 0,
                    transition: "opacity 1s ease",
                    transitionDelay: "0.55s",
                }}
            >
                <span
                    style={{
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                        color: "rgba(245,245,244,0.45)",
                        textTransform: "uppercase",
                    }}
                >
                    One control plane for the entire Elixpo suite
                </span>
                <div
                    style={{
                        position: "relative",
                        width: "100%",
                        maxWidth: 880,
                        overflow: "hidden",
                        WebkitMaskImage:
                            "linear-gradient(to right, transparent, white 15%, white 85%, transparent)",
                        maskImage:
                            "linear-gradient(to right, transparent, white 15%, white 85%, transparent)",
                    }}
                >
                    <div
                        className="pay-marquee"
                        style={{
                            display: "flex",
                            width: "max-content",
                            gap: 52,
                            padding: "4px 0",
                        }}
                    >
                        {[0, 1].map((dup) => (
                            <div
                                key={dup}
                                style={{
                                    display: "flex",
                                    gap: 52,
                                    alignItems: "center",
                                }}
                                aria-hidden={dup === 1}
                            >
                                {ELIXPO_PRODUCTS.map((b) => (
                                    <span
                                        key={`${dup}-${b.name}`}
                                        aria-label={b.name}
                                        style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                        }}
                                    >
                                        {b.node}
                                    </span>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
