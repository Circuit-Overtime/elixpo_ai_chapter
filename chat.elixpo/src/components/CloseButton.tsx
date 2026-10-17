"use client";

import { useRouter } from "next/navigation";

export default function CloseButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push("/")}
      className="fixed top-[3%] right-[3%] z-20 flex items-center justify-center w-11 h-11 rounded-lg text-2xl bg-white/60 backdrop-blur-lg cursor-pointer transition-all duration-250 hover:bg-white/70 hover:shadow-lg active:bg-white/85"
      aria-label="Close"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}
