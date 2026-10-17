"use client";

/** Cloudflare-style globe (cobe / WebGL) with request markers per country.
 * Interactive: drag to rotate horizontally/vertically; auto-spins when idle. */

import { CENTROIDS } from "@/components/country-centroids";
import type { Dim } from "@/lib/metrics";
import { Box } from "@mui/material";
import createGlobe from "cobe";
import { useEffect, useRef } from "react";

export default function Globe({
    country,
    size = 340,
}: { country: Dim[]; size?: number }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const phiRef = useRef(0);
    const rRef = useRef(0); // horizontal drag offset
    const thetaRef = useRef(0.25); // vertical angle
    const pointer = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const max = Math.max(...country.map((c) => c.count), 1);
        const markers = country
            .map((c) => {
                const loc = CENTROIDS[c.label];
                if (!loc) return null;
                return { location: loc, size: 0.03 + (c.count / max) * 0.09 };
            })
            .filter(Boolean) as { location: [number, number]; size: number }[];

        let raf = 0;
        let globe: {
            update: (s: { phi: number; theta: number }) => void;
            destroy: () => void;
        } | null = null;
        try {
            globe = createGlobe(canvas, {
                devicePixelRatio: 2,
                width: size * 2,
                height: size * 2,
                phi: 0,
                theta: thetaRef.current,
                dark: 1,
                diffuse: 1.2,
                mapSamples: 16000,
                mapBrightness: 5,
                baseColor: [0.28, 0.26, 0.38],
                markerColor: [0.61, 0.48, 0.97],
                glowColor: [0.36, 0.26, 0.6],
                markers,
            });
            const tick = () => {
                if (!pointer.current) phiRef.current += 0.004; // idle auto-spin
                globe?.update({
                    phi: phiRef.current + rRef.current,
                    theta: thetaRef.current,
                });
                raf = requestAnimationFrame(tick);
            };
            raf = requestAnimationFrame(tick);
        } catch {
            // WebGL unavailable
        }
        return () => {
            cancelAnimationFrame(raf);
            globe?.destroy();
        };
    }, [country, size]);

    return (
        <Box
            sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
            }}
        >
            <canvas
                ref={canvasRef}
                onPointerDown={(e) => {
                    pointer.current = { x: e.clientX, y: e.clientY };
                    (e.target as HTMLElement).setPointerCapture(e.pointerId);
                }}
                onPointerUp={() => {
                    pointer.current = null;
                }}
                onPointerOut={() => {
                    pointer.current = null;
                }}
                onPointerMove={(e) => {
                    if (!pointer.current) return;
                    const dx = e.clientX - pointer.current.x;
                    const dy = e.clientY - pointer.current.y;
                    rRef.current += dx / 180;
                    thetaRef.current = Math.max(
                        -0.6,
                        Math.min(0.9, thetaRef.current + dy / 220),
                    );
                    pointer.current = { x: e.clientX, y: e.clientY };
                }}
                style={{
                    width: size,
                    height: size,
                    maxWidth: "100%",
                    aspectRatio: "1",
                    cursor: "grab",
                    touchAction: "none",
                }}
            />
        </Box>
    );
}
