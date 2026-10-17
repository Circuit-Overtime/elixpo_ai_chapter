"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/components/AuthProvider";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Navbar() {
  const { user, loading, login, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <motion.nav
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="fixed top-0 left-0 w-full z-50 flex items-center justify-between px-6 md:px-10 py-3 backdrop-blur-xl bg-white/80 dark:bg-neutral-950/80 border-b border-neutral-100 dark:border-neutral-800"
    >
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2.5">
        <Image src="/images/logo.png" alt="Elixpo" width={36} height={36} className="rounded-lg" />
        <span className="font-[family-name:var(--font-parkinsans)] font-bold text-lg text-neutral-900 dark:text-white">
          Elixpo Chat
        </span>
      </Link>

      {/* Desktop nav — all right-aligned */}
      <div className="hidden md:flex items-center gap-1">
        <NavLink href="/pricing">Pricing</NavLink>
        <NavLink href="/news">News</NavLink>
        <NavLink href="/podcast">Podcast</NavLink>
        <NavLink href="/discover">Discover</NavLink>
        <NavLink href="/chat/new">Chat</NavLink>

        <div className="w-px h-5 bg-neutral-200 dark:bg-neutral-800 mx-3" />
        <ThemeToggle />
        <div className="w-px h-5 bg-neutral-200 dark:bg-neutral-800 mx-3" />

        {loading ? (
          <div className="w-8 h-8 rounded-full bg-neutral-100 animate-pulse" />
        ) : user ? (
          <UserMenu user={user} logout={logout} />
        ) : (
          <button
            onClick={login}
            className="px-5 py-2 rounded-full text-sm font-semibold bg-neutral-900 text-white hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            Sign in
          </button>
        )}
      </div>

      {/* Mobile hamburger */}
      <div className="flex items-center gap-3 md:hidden">
        <ThemeToggle />
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="flex flex-col gap-1.5 p-2"
          aria-label="Toggle menu"
        >
          <span className={`w-5 h-0.5 bg-neutral-900 dark:bg-neutral-100 transition-all ${mobileOpen ? "rotate-45 translate-y-2" : ""}`} />
          <span className={`w-5 h-0.5 bg-neutral-900 dark:bg-neutral-100 transition-all ${mobileOpen ? "opacity-0" : ""}`} />
          <span className={`w-5 h-0.5 bg-neutral-900 dark:bg-neutral-100 transition-all ${mobileOpen ? "-rotate-45 -translate-y-2" : ""}`} />
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 w-full bg-white dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 shadow-lg md:hidden"
          >
            <div className="flex flex-col p-6 gap-4">
              <MobileLink href="/pricing" onClick={() => setMobileOpen(false)}>Pricing</MobileLink>
              <MobileLink href="/news" onClick={() => setMobileOpen(false)}>News</MobileLink>
              <MobileLink href="/podcast" onClick={() => setMobileOpen(false)}>Podcast</MobileLink>
              <MobileLink href="/discover" onClick={() => setMobileOpen(false)}>Discover</MobileLink>
              <MobileLink href="/chat/new" onClick={() => setMobileOpen(false)}>Chat</MobileLink>
              {user ? (
                <button
                  onClick={() => { setMobileOpen(false); logout(); }}
                  className="mt-2 px-5 py-2.5 rounded-full text-sm font-semibold border border-neutral-200 text-neutral-600 text-center"
                >
                  Sign out ({user.displayName})
                </button>
              ) : (
                <button
                  onClick={() => { setMobileOpen(false); login(); }}
                  className="mt-2 px-5 py-2.5 rounded-full text-sm font-semibold bg-neutral-900 text-white text-center"
                >
                  Sign in
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-4 py-2 rounded-lg text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all"
    >
      {children}
    </Link>
  );
}

function MobileLink({ href, children, onClick }: { href: string; children: React.ReactNode; onClick: () => void }) {
  return (
    <Link href={href} onClick={onClick} className="text-base font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white">
      {children}
    </Link>
  );
}

function UserMenu({ user, logout }: { user: { displayName: string; email: string }; logout: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-full bg-neutral-900 text-white text-xs font-bold flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-neutral-300 transition-all"
      >
        {user.displayName.charAt(0).toUpperCase()}
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-neutral-100 z-50 overflow-hidden"
            >
              {/* User info */}
              <div className="px-4 py-3 border-b border-neutral-100">
                <p className="text-sm font-semibold text-neutral-900 truncate">{user.displayName}</p>
                <p className="text-xs text-neutral-400 truncate">{user.email}</p>
              </div>

              {/* Upgrade */}
              <div className="px-3 py-2">
                <Link
                  href="/pricing"
                  onClick={() => setOpen(false)}
                  className="w-full block px-3 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 transition-all cursor-pointer text-center"
                >
                  Upgrade Plan
                </Link>
              </div>

              <div className="border-t border-neutral-100">
                <MenuItem icon="⚙️" label="Settings" onClick={() => setOpen(false)} />
                <MenuItem icon="🌐" label="Language" onClick={() => setOpen(false)} />
                <MenuItem icon="📖" label="Learn more" href="https://elixpo.com" onClick={() => setOpen(false)} />
              </div>

              <div className="border-t border-neutral-100">
                <button
                  onClick={() => { setOpen(false); logout(); }}
                  className="w-full px-4 py-2.5 text-left text-sm text-red-500 hover:bg-red-50 transition-colors cursor-pointer flex items-center gap-2.5"
                >
                  <span>🚪</span>
                  <span>Log out</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuItem({ icon, label, href, onClick }: { icon: string; label: string; href?: string; onClick: () => void }) {
  const cls = "w-full px-4 py-2.5 text-left text-sm text-neutral-600 hover:bg-neutral-50 transition-colors cursor-pointer flex items-center gap-2.5";
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={cls}>
        <span>{icon}</span><span>{label}</span>
      </a>
    );
  }
  return (
    <button onClick={onClick} className={cls}>
      <span>{icon}</span><span>{label}</span>
    </button>
  );
}
