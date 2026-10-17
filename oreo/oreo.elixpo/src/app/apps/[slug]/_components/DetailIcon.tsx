"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { AppEntry } from "@/data/apps";

/* Big hero icon for the detail route. Renders the real PNG with a
 * subtle scale-in + pixelated rendering so the badge artwork stays
 * crisp at 128 px. Wrapped in a client boundary because we want the
 * graceful fallback (Lucide isn't loaded here intentionally — if the
 * PNG fails we just show the first letter, keeping the bundle thin). */

export default function DetailIcon({
  app, tintRing,
}: {
  app: AppEntry;
  tintRing: string;
}) {
  const [pngOk, setPngOk] = useState(true);
  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0, y: 8 }}
      animate={{ scale: 1,    opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className={`relative grid h-32 w-32 place-items-center overflow-hidden
                  rounded-2xl bg-card-sub p-4 ring-2 ring-inset ${tintRing}
                  shadow-[0_20px_60px_-15px_rgba(255,93,104,0.45)]`}
    >
      {app.pngIcon && pngOk ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={app.pngIcon}
          alt={app.name}
          onError={() => setPngOk(false)}
          className="h-full w-full object-contain"
          style={{ imageRendering: "pixelated" }}
        />
      ) : (
        <span className="font-display text-6xl text-primary">
          {app.name[0]?.toUpperCase()}
        </span>
      )}
    </motion.div>
  );
}
