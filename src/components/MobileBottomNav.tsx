"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function MobileBottomNav() {
  const pathname = usePathname();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;

  // Hide on desktop
  if (typeof window !== "undefined" && window.innerWidth >= 768) {
    return null;
  }

  const navItems = [
    { href: "/chat/new", label: "Chat", icon: "💬" },
    { href: "/news", label: "News", icon: "📰" },
    { href: "/podcast", label: "Podcast", icon: "🎙️" },
    { href: "/discover", label: "Discover", icon: "🔍" },
  ];

  const isActive = (href: string) => {
    if (href === "/chat/new") return pathname === "/chat/new" || pathname.startsWith("/chat/");
    return pathname === href || pathname.startsWith(href);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 md:hidden z-40 bg-white/95 backdrop-blur-sm border-t border-neutral-100 px-2 py-2">
      <div className="grid grid-cols-4 gap-1">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center py-2.5 px-1.5 rounded-lg transition-all ${
                active
                  ? "bg-neutral-100 text-neutral-900"
                  : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              <span className="text-lg mb-0.5">{item.icon}</span>
              <span className="text-[10px] font-medium truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
