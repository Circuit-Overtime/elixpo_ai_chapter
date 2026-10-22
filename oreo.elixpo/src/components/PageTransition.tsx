"use client";

import { motion } from "framer-motion";
import { usePathname } from "next/navigation";

/* Lightweight route-change reveal. Just an opacity + y-slide on the
 * <main> contents, keyed on pathname so Next remounts the wrapper
 * each navigation. Deliberately minimal — Framer's `AnimatePresence`
 * with `mode="wait"` adds a perceptible delay before the new page
 * paints, which is the opposite of the "no-lag" feel the user wants.
 *
 * This is the simplest pattern that still gives the site some
 * "transition feel" without ever blocking the new page from showing.
 */

export default function PageTransition({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
