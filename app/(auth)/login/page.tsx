"use client";

import gsap from "gsap";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { getContrastColor } from "@/lib/branding-validation";
import {
    useVerifiedBranding,
    VerifiedBrandBanner,
} from "../../components/verified-brand-banner";

const GithubIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
    >
        <title>GitHub Logo</title>
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v 3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
);

const GoogleIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
    >
        <title>Google Logo</title>
        <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
        />
        <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
        />
        <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
        />
        <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
        />
    </svg>
);

const DiscordIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="#5865F2"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
    >
        <title>Discord Logo</title>
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.418 2.157-2.418 1.21 0 2.176 1.094 2.157 2.418 0 1.334-.956 2.42-2.157 2.42zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.21 0 2.176 1.094 2.157 2.418 0 1.334-.946 2.42-2.157 2.42z" />
    </svg>
);

const MicrosoftIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg
        width="20"
        height="20"
        viewBox="0 0 23 23"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
    >
        <title>Microsoft Logo</title>
        <path d="M0 0h11v11H0z" fill="#F25022" />
        <path d="M12 0h11v11H12z" fill="#7FBA00" />
        <path d="M0 12h11v11H0z" fill="#00A4EF" />
        <path d="M12 12h11v11H12z" fill="#FFB900" />
    </svg>
);

const LoginContent = () => {
    const searchParams = useSearchParams();
    const next = searchParams.get("next");
    const branding = useVerifiedBranding(next);
    const addAccount = searchParams.get("add_account") === "1";
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [rememberMe, setRememberMe] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [checkingAuth, setCheckingAuth] = useState(true);
    const [error, setError] = useState("");

    // Auto-redirect if session is active
    useEffect(() => {
        const checkExistingSession = async () => {
            if (addAccount) {
                setCheckingAuth(false);
                return;
            }
            try {
                const res = await fetch("/api/auth/me", {
                    credentials: "include",
                });
                if (res.ok) {
                    const data: any = await res.json();
                    if (next) {
                        window.location.href = next;
                    } else if (!data.displayName) {
                        window.location.href = "/setup-name";
                    } else {
                        window.location.href = "/dashboard/oauth-apps";
                    }
                    return;
                }
            } catch {
                // Ignore
            }
            setCheckingAuth(false);
        };
        checkExistingSession();
    }, [addAccount, next]);

    // GSAP staggered loading animation
    useEffect(() => {
        if (!checkingAuth) {
            gsap.fromTo(
                ".gsap-login-animate",
                { opacity: 0, y: 30 },
                {
                    opacity: 1,
                    y: 0,
                    duration: 0.8,
                    stagger: 0.12,
                    ease: "power3.out",
                },
            );
        }
    }, [checkingAuth]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email,
                    password,
                    provider: "email",
                    rememberMe,
                }),
            });

            const data: any = await res.json();

            if (!res.ok) {
                setError(data.error || "Login failed");
                return;
            }

            if (data.requiresMfa && data.mfaToken) {
                const params = new URLSearchParams({
                    token: data.mfaToken,
                });
                if (Array.isArray(data.availableMethods)) {
                    params.set("methods", data.availableMethods.join(","));
                }
                if (next) params.set("next", next);
                window.location.href = `/mfa?${params.toString()}`;
                return;
            }

            if (next) {
                window.location.href = next;
            } else if (data.needsDisplayName) {
                window.location.href = "/setup-name";
            } else {
                window.location.href = "/dashboard/oauth-apps";
            }
        } catch {
            setError("Network error, please try again");
        } finally {
            setLoading(false);
        }
    };

    const handleSSOLogin = (
        provider: "google" | "github" | "discord" | "microsoft",
    ) => {
        const url = `/api/auth/oauth/${provider}?mode=login${
            next ? `&next=${encodeURIComponent(next)}` : ""
        }`;
        window.location.href = url;
    };

    if (checkingAuth) {
        return (
            <div className="min-h-[80vh] flex items-center justify-center bg-transparent">
                <svg
                    className="animate-spin h-8 w-8 text-[#ff7759]"
                    fill="none"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                    />
                    <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                </svg>
            </div>
        );
    }

    return (
        <div className="min-h-[80vh] flex items-center justify-center bg-transparent px-5 py-12 text-[var(--fg)] font-body">
            <div className="max-w-[900px] w-full bg-[var(--surface)]/70 border border-[var(--border)] backdrop-blur-xl rounded-2xl p-6 sm:p-10 shadow-[0_8px_32px_rgba(25,40,55,0.02)] flex flex-col md:flex-row gap-8 sm:gap-12 gsap-login-animate">
                {/* Email Form Column */}
                <div className="flex-1 flex flex-col justify-center">
                    <VerifiedBrandBanner branding={branding} />
                    <div className="text-center mb-8">
                        <div className="flex justify-center mb-3">
                            <img
                                src="/LOGO/logo.png"
                                alt="Elixpo Mascot"
                                className="w-12 h-12 rounded-xl object-contain bg-[var(--surface)]/80 p-0.5 shadow-sm"
                            />
                        </div>
                        <h2 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight mb-1.5">
                            {addAccount
                                ? "Add another account"
                                : branding
                                  ? `Sign in to continue`
                                  : "Welcome Back"}
                        </h2>
                        <p className="text-sm opacity-60 font-semibold tracking-wide">
                            {addAccount
                                ? "Sign in without logging out your current account"
                                : branding
                                  ? `Use your account to continue to ${branding.displayName}`
                                  : "Sign in to your Elixpo Account"}
                        </p>
                    </div>

                    <form
                        onSubmit={handleSubmit}
                        className="flex flex-col gap-4"
                    >
                        {/* Email Input */}
                        <div className="flex flex-col gap-1.5">
                            <label
                                htmlFor="email"
                                className="text-xs font-bold uppercase tracking-wider opacity-60"
                            >
                                Email Address
                            </label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                placeholder="name@domain.com"
                                className="w-full px-4 py-3 border border-[var(--border)] bg-[var(--surface)]/80 rounded-xl text-sm font-semibold focus:outline-none focus:border-[#ff7759] focus:ring-1 focus:ring-[#ff7759]"
                            />
                        </div>

                        {/* Password Input */}
                        <div className="flex flex-col gap-1.5 relative">
                            <label
                                htmlFor="password"
                                className="text-xs font-bold uppercase tracking-wider opacity-60"
                            >
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) =>
                                        setPassword(e.target.value)
                                    }
                                    required
                                    placeholder="••••••••"
                                    className="w-full px-4 py-3 pr-12 border border-[var(--border)] bg-[var(--surface)]/80 rounded-xl text-sm font-semibold focus:outline-none focus:border-[#ff7759] focus:ring-1 focus:ring-[#ff7759]"
                                />
                                <button
                                    type="button"
                                    onClick={() =>
                                        setShowPassword(!showPassword)
                                    }
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--fg-faint)] hover:text-[var(--fg)] focus:outline-none"
                                >
                                    {showPassword ? (
                                        <EyeOff className="w-5 h-5" />
                                    ) : (
                                        <Eye className="w-5 h-5" />
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Action row */}
                        <div className="flex justify-between items-center mt-1">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={rememberMe}
                                    onChange={(e) =>
                                        setRememberMe(e.target.checked)
                                    }
                                    className="w-4.5 h-4.5 text-[#ff7759] border-[var(--border)] rounded focus:ring-[#ff7759]"
                                />
                                <span className="text-xs font-semibold opacity-70">
                                    Remember me
                                </span>
                            </label>
                            <Link
                                href={
                                    next
                                        ? `/forgot-password?next=${encodeURIComponent(next)}`
                                        : "/forgot-password"
                                }
                                className="text-xs font-bold text-[#ff7759] hover:underline"
                            >
                                Forgot password?
                            </Link>
                        </div>

                        {/* Error Message */}
                        {error && (
                            <p className="text-xs font-bold text-red-600 text-center bg-red-50 border border-red-200 py-2.5 rounded-xl">
                                {error}
                            </p>
                        )}

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full mt-2 bg-[#ff7759] hover:brightness-110 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-all shadow-md active:scale-[0.98] select-none flex items-center justify-center gap-2"
                            style={
                                branding
                                    ? {
                                          backgroundColor:
                                              branding.primaryColor,
                                          color: getContrastColor(
                                              branding.primaryColor,
                                          ),
                                      }
                                    : undefined
                            }
                        >
                            {loading ? (
                                <>
                                    <svg
                                        className="animate-spin h-4 w-4 text-white"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        xmlns="http://www.w3.org/2000/svg"
                                    >
                                        <circle
                                            className="opacity-25"
                                            cx="12"
                                            cy="12"
                                            r="10"
                                            stroke="currentColor"
                                            strokeWidth="4"
                                        />
                                        <path
                                            className="opacity-75"
                                            fill="currentColor"
                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                        />
                                    </svg>
                                    <span>Signing in...</span>
                                </>
                            ) : (
                                <span>Sign In</span>
                            )}
                        </button>
                    </form>

                    {/* Registration Redirect */}
                    <div className="mt-6 pt-6 border-t border-[var(--border)] text-center flex flex-col gap-1.5">
                        <span className="text-xs opacity-75 font-semibold">
                            Don't have an account yet?
                        </span>
                        <Link
                            href={
                                next
                                    ? `/register?next=${encodeURIComponent(next)}`
                                    : "/register"
                            }
                            className="text-sm font-bold text-[#ff7759] hover:underline"
                        >
                            {branding
                                ? `Create an account for ${branding.displayName}`
                                : "Create an Elixpo ID"}
                        </Link>
                    </div>
                </div>

                {/* SSO Button Column */}
                <div className="flex-1 flex flex-col justify-center pl-0 md:pl-8 border-t md:border-t-0 md:border-l border-[var(--border)] pt-6 md:pt-0">
                    <p className="text-center text-xs font-bold uppercase tracking-wider opacity-50 mb-6">
                        Or continue with
                    </p>

                    <div className="flex flex-col gap-3">
                        <button
                            onClick={() => handleSSOLogin("google")}
                            className="w-full flex items-center justify-center gap-3 border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--overlay)] py-3 rounded-xl text-sm font-semibold tracking-wide transition-all active:scale-[0.98] select-none text-[var(--fg)]"
                        >
                            <GoogleIcon />
                            <span>Sign in with Google</span>
                        </button>

                        <button
                            onClick={() => handleSSOLogin("github")}
                            className="w-full flex items-center justify-center gap-3 border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--overlay)] py-3 rounded-xl text-sm font-semibold tracking-wide transition-all active:scale-[0.98] select-none text-[var(--fg)]"
                        >
                            <GithubIcon />
                            <span>Sign in with GitHub</span>
                        </button>

                        <button
                            onClick={() => handleSSOLogin("discord")}
                            className="w-full flex items-center justify-center gap-3 border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--overlay)] py-3 rounded-xl text-sm font-semibold tracking-wide transition-all active:scale-[0.98] select-none text-[var(--fg)]"
                        >
                            <DiscordIcon />
                            <span>Sign in with Discord</span>
                        </button>

                        <button
                            onClick={() => handleSSOLogin("microsoft")}
                            className="w-full flex items-center justify-center gap-3 border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--overlay)] py-3 rounded-xl text-sm font-semibold tracking-wide transition-all active:scale-[0.98] select-none text-[var(--fg)]"
                        >
                            <MicrosoftIcon />
                            <span>Sign in with Microsoft</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const LoginPage = () => (
    <Suspense>
        <LoginContent />
    </Suspense>
);

export default LoginPage;
