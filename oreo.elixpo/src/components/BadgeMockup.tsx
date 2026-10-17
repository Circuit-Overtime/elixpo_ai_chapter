"use client";

import { motion } from "framer-motion";

/* SVG mockup of the actual hardware — portrait PCB with a screen
 * top-60%, two rows of four tactile buttons below, IR transceiver at
 * the top edge, four corner LEDs, and a USB-C cutout on the bottom.
 *
 * Pure SVG so the whole thing scales sharply at any resolution, and
 * the animation is just `<animate>`/`framer-motion` over the on-screen
 * app-tile grid — costs ~0% CPU after the initial paint.
 *
 * Drawing units are tuned so 1 SVG unit ≈ 1 mm on the PCB; final
 * artwork lives at viewBox="0 0 100 160".
 */

const APP_TILES: { x: number; y: number; tint: string; glyph: string }[] = [
  { x:  6, y:  4, tint: "#FF5D68", glyph: "B" },
  { x: 28, y:  4, tint: "#3DDC97", glyph: "S" },
  { x: 50, y:  4, tint: "#FFD166", glyph: "G" },
  { x: 72, y:  4, tint: "#A29BFE", glyph: "F" },
  { x:  6, y: 26, tint: "#A29BFE", glyph: "R" },
  { x: 28, y: 26, tint: "#FF5D68", glyph: "Q" },
  { x: 50, y: 26, tint: "#3DDC97", glyph: "W" },
  { x: 72, y: 26, tint: "#FFD166", glyph: "C" },
];

const BUTTON_LABELS = ["HOME", "A", "B", "C", "UP", "DOWN", "LEFT", "RIGHT"];

export default function BadgeMockup({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 160"
      role="img"
      aria-label="Oreo badge hardware mockup"
      className={`h-auto w-full max-w-[280px] ${className}`}
      style={{ filter: "drop-shadow(0 20px 60px rgba(255,93,104,0.25))" }}
    >
      {/* PCB body */}
      <defs>
        <linearGradient id="pcb" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#1F1B33" />
          <stop offset="100%" stopColor="#16142A" />
        </linearGradient>
        <linearGradient id="screenGlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#1B1830" />
          <stop offset="100%" stopColor="#0F0C1C" />
        </linearGradient>
        <radialGradient id="ledGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#FF5D68" stopOpacity="1" />
          <stop offset="100%" stopColor="#FF5D68" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Outer body with rounded corners */}
      <rect x="2" y="2" width="96" height="156" rx="8" ry="8"
            fill="url(#pcb)" stroke="#2A2640" strokeWidth="0.5" />

      {/* IR window at top centre */}
      <rect x="44" y="3.5" width="12" height="2" rx="1"
            fill="#3DDC97" opacity="0.55" />
      <text x="50" y="7.6" textAnchor="middle" fontSize="2" fill="#8A8294"
            fontFamily="ui-monospace, monospace">IR</text>

      {/* LCD bezel */}
      <rect x="6" y="10" width="88" height="60" rx="2"
            fill="#06050D" stroke="#FF5D68" strokeWidth="0.4" />
      <rect x="8" y="12" width="84" height="56" rx="1"
            fill="url(#screenGlow)" />

      {/* App-tile grid on the screen */}
      {APP_TILES.map((t, i) => (
        <g key={i} transform={`translate(${10 + t.x * 0.95}, ${14 + t.y * 0.95})`}>
          <rect width="16" height="16" rx="2" fill={t.tint} opacity="0.18" />
          <rect width="16" height="16" rx="2" fill="none"
                stroke={t.tint} strokeWidth="0.4" opacity="0.7" />
          <text x="8" y="11.2" textAnchor="middle" fontSize="8"
                fontFamily="ui-monospace, monospace" fill={t.tint}>
            {t.glyph}
          </text>
        </g>
      ))}

      {/* "Receiving 47%" pretend progress bar in screen footer */}
      <rect x="8" y="63"  width="84" height="3" rx="1.5"  fill="#26213E" />
      <motion.rect
        x="8" y="63" height="3" rx="1.5" fill="#FF5D68"
        initial={{ width: 0 }}
        animate={{ width: 50 }}
        transition={{ duration: 2.2, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", repeatDelay: 0.3 }}
      />

      {/* Button matrix — 2 rows × 4 buttons */}
      {Array.from({ length: 8 }).map((_, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const x   = 8 + col * 22;
        const y   = 80 + row * 22;
        return (
          <g key={`btn-${i}`}>
            <rect x={x} y={y} width="18" height="14" rx="3"
                  fill="#26213E" stroke="#2A2640" strokeWidth="0.4" />
            <circle cx={x + 9} cy={y + 6} r="4"
                    fill="#1C1A2E" stroke="#3A3550" strokeWidth="0.4" />
            <text x={x + 9} y={y + 13} textAnchor="middle" fontSize="2.2"
                  fontFamily="ui-monospace, monospace" fill="#8A8294">
              {BUTTON_LABELS[i]}
            </text>
          </g>
        );
      })}

      {/* IMU + decoupling caps along the right edge */}
      <rect x="88" y="80"  width="6"  height="6" rx="0.5" fill="#1C1A2E" stroke="#2A2640" strokeWidth="0.3" />
      <text x="91" y="84.2" textAnchor="middle" fontSize="2" fill="#8A8294" fontFamily="ui-monospace, monospace">IMU</text>

      {/* USB-C connector at the bottom */}
      <rect x="38" y="153" width="24" height="6" rx="2"
            fill="#0F0C1C" stroke="#2A2640" strokeWidth="0.4" />
      <text x="50" y="150" textAnchor="middle" fontSize="2.2" fill="#8A8294"
            fontFamily="ui-monospace, monospace">USB-C</text>

      {/* Corner LEDs — animated pulse */}
      {[
        { cx: 6,  cy: 14  },
        { cx: 94, cy: 14  },
        { cx: 6,  cy: 144 },
        { cx: 94, cy: 144 },
      ].map((p, i) => (
        <g key={`led-${i}`}>
          <circle cx={p.cx} cy={p.cy} r="3" fill="url(#ledGlow)" opacity="0.7" />
          <motion.circle
            cx={p.cx} cy={p.cy} r="1"
            fill="#FF5D68"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{
              duration: 2.2,
              repeat: Infinity,
              delay: i * 0.5,
              ease: "easeInOut",
            }}
          />
        </g>
      ))}
    </svg>
  );
}
