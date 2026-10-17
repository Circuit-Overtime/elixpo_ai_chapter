"use client";

import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import {
    Box,
    Button,
    IconButton,
    InputAdornment,
    TextField,
    Typography,
} from "@mui/material";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { getContrastColor } from "@/lib/branding-validation";
import {
    useVerifiedBranding,
    VerifiedBrandBanner,
} from "../../components/verified-brand-banner";

const textFieldSx = {
    "& .MuiOutlinedInput-root": {
        color: "var(--fg)",
        background: "transparent",
        "& fieldset": { borderColor: "var(--border)" },
        "&:hover fieldset": { borderColor: "var(--border)" },
        "&.Mui-focused fieldset": { borderColor: "#ff7759" },
        "& input:-webkit-autofill": {
            WebkitBoxShadow: "0 0 0 1000px transparent inset !important",
            WebkitTextFillColor: "var(--fg) !important",
            WebkitTransition: "background-color 5000s ease-in-out 0s",
        },
        "& input:-webkit-autofill:hover": {
            WebkitBoxShadow: "0 0 0 1000px transparent inset !important",
            WebkitTextFillColor: "var(--fg) !important",
        },
        "& input:-webkit-autofill:focus": {
            WebkitBoxShadow: "0 0 0 1000px transparent inset !important",
            WebkitTextFillColor: "var(--fg) !important",
        },
    },
    "& .MuiInputBase-input::placeholder": { color: "transparent", opacity: 0 },
    "& .MuiInputLabel-root": { color: "var(--fg-muted)" },
    "& .MuiInputLabel-root.Mui-focused": { color: "#ff7759" },
};

const RegisterContent = () => {
    const searchParams = useSearchParams();
    const next = searchParams.get("next");
    const branding = useVerifiedBranding(next);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (password !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        if (password.length < 8) {
            setError("Password must be at least 8 characters");
            return;
        }

        setLoading(true);

        try {
            const res = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password, provider: "email" }),
            });

            const data: any = await res.json();

            if (!res.ok) {
                setError(data.error || "Registration failed");
                return;
            }

            // Redirect email/password users to set their display name
            const nextParam = next ? `?next=${encodeURIComponent(next)}` : "";
            if (data.needsDisplayName) {
                window.location.href = `/setup-name${nextParam}`;
            } else if (next) {
                window.location.href = next;
            } else {
                window.location.href = "/dashboard/oauth-apps";
            }
        } catch {
            setError("Network error, please try again");
        } finally {
            setLoading(false);
        }
    };

    const handleSSORegister = (
        provider: "google" | "github" | "discord" | "microsoft",
    ) => {
        // Redirect through our backend so state cookie is set correctly before going to provider
        const url = `/api/auth/oauth/${provider}?mode=register${next ? `&next=${encodeURIComponent(next)}` : ""}`;
        window.location.href = url;
    };

    return (
        <Box
            sx={{
                minHeight: "90vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                p: 2,
            }}
        >
            <Box
                sx={{
                    maxWidth: "900px",
                    maxHeight: "85vh",
                    width: "100%",
                    display: "flex",
                    gap: 2.5,
                    backdropFilter: "blur(20px)",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "16px",
                    p: 3,
                    flexDirection: { xs: "column", md: "row" },
                    overflowY: "auto",
                }}
            >
                <Box
                    sx={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                    }}
                >
                    <VerifiedBrandBanner branding={branding} />
                    <Box sx={{ mb: 2, textAlign: "center" }}>
                        <Typography
                            variant="h4"
                            sx={{
                                fontWeight: 700,
                                color: "var(--fg)",
                                mb: 0.5,
                            }}
                        >
                            {branding
                                ? `Create an account for ${branding.displayName}`
                                : "Create Account"}
                        </Typography>
                        <Typography
                            sx={{
                                color: "var(--fg-faint)",
                                fontSize: "0.95rem",
                            }}
                        >
                            {branding
                                ? `You will return to ${branding.domain} after setup`
                                : "Register for your SSO account"}
                        </Typography>
                    </Box>

                    {error && (
                        <Box
                            sx={{
                                background: "rgba(239, 68, 68, 0.1)",
                                border: "1px solid rgba(239, 68, 68, 0.3)",
                                color: "#b91c1c",
                                p: 1.5,
                                borderRadius: "8px",
                                mb: 2,
                                fontSize: "0.85rem",
                            }}
                        >
                            {error}
                        </Box>
                    )}

                    <form onSubmit={handleSubmit}>
                        <TextField
                            fullWidth
                            label="Email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            margin="dense"
                            sx={textFieldSx}
                            required
                        />
                        <TextField
                            fullWidth
                            label="Password"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            margin="dense"
                            helperText="Minimum 8 characters"
                            sx={{
                                ...textFieldSx,
                                "& .MuiFormHelperText-root": {
                                    color: "var(--fg-faint)",
                                },
                            }}
                            required
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <IconButton
                                            onClick={() =>
                                                setShowPassword(!showPassword)
                                            }
                                            edge="end"
                                            sx={{
                                                color: "var(--fg-faint)",
                                            }}
                                        >
                                            {showPassword ? (
                                                <VisibilityOffIcon />
                                            ) : (
                                                <VisibilityIcon />
                                            )}
                                        </IconButton>
                                    </InputAdornment>
                                ),
                            }}
                        />
                        <TextField
                            fullWidth
                            label="Confirm Password"
                            type={showConfirmPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            margin="dense"
                            sx={textFieldSx}
                            required
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <IconButton
                                            onClick={() =>
                                                setShowConfirmPassword(
                                                    !showConfirmPassword,
                                                )
                                            }
                                            edge="end"
                                            sx={{
                                                color: "var(--fg-faint)",
                                            }}
                                        >
                                            {showConfirmPassword ? (
                                                <VisibilityOffIcon />
                                            ) : (
                                                <VisibilityIcon />
                                            )}
                                        </IconButton>
                                    </InputAdornment>
                                ),
                            }}
                        />

                        <Button
                            fullWidth
                            variant="contained"
                            type="submit"
                            disabled={loading}
                            sx={{
                                my: 2,
                                background: branding?.primaryColor || "#ff7759",
                                color: branding
                                    ? getContrastColor(branding.primaryColor)
                                    : "#fff",
                                border: `1px solid ${branding?.primaryColor || "#ff7759"}`,
                                fontWeight: 600,
                                py: 1.5,
                                textTransform: "none",
                                fontSize: "1rem",
                                "&:hover": {
                                    filter: "brightness(1.05)",
                                },
                                "&:disabled": {
                                    color: "var(--fg-faint)",
                                    borderColor: "var(--border)",
                                },
                            }}
                        >
                            {loading ? "Creating account..." : "Create Account"}
                        </Button>
                    </form>

                    <Box
                        sx={{
                            mt: 2,
                            pt: 2,
                            borderTop: "1px solid var(--border)",
                            textAlign: "center",
                        }}
                    >
                        <Typography sx={{ color: "var(--fg-muted)", mb: 1 }}>
                            Already have an account?
                        </Typography>
                        <Link
                            href={
                                next
                                    ? `/login?next=${encodeURIComponent(next)}`
                                    : "/login"
                            }
                            style={{
                                color: "#ff7759",
                                textDecoration: "none",
                                fontWeight: 600,
                            }}
                        >
                            Sign in
                        </Link>
                    </Box>
                </Box>

                {/* Right Column - SSO */}
                <Box
                    sx={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        paddingLeft: { xs: 0, md: 3 },
                        borderLeft: {
                            xs: "none",
                            md: "1px solid var(--border)",
                        },
                        paddingTop: { xs: 2, md: 0 },
                        borderTop: {
                            xs: "1px solid var(--border)",
                            md: "none",
                        },
                    }}
                >
                    <Box sx={{ mb: 2, textAlign: "center" }}>
                        <Typography
                            sx={{
                                color: "var(--fg-faint)",
                                fontSize: "0.9rem",
                            }}
                        >
                            Or register with
                        </Typography>
                    </Box>

                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 1.5,
                        }}
                    >
                        <Button
                            fullWidth
                            variant="outlined"
                            onClick={() => handleSSORegister("google")}
                            sx={{
                                color: "var(--fg)",
                                borderColor: "var(--border)",
                                "&:hover": {
                                    borderColor: "var(--border)",
                                    backgroundColor: "var(--overlay)",
                                },
                                py: 1,
                                textTransform: "none",
                                fontSize: "0.95rem",
                                fontWeight: 500,
                            }}
                        >
                            <Box
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1,
                                }}
                            >
                                <svg
                                    width="20"
                                    height="20"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
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
                                Register with Google
                            </Box>
                        </Button>
                        <Button
                            fullWidth
                            variant="outlined"
                            onClick={() => handleSSORegister("github")}
                            sx={{
                                color: "var(--fg)",
                                borderColor: "var(--border)",
                                "&:hover": {
                                    borderColor: "var(--border)",
                                    backgroundColor: "var(--overlay)",
                                },
                                py: 1,
                                textTransform: "none",
                                fontSize: "0.95rem",
                                fontWeight: 500,
                            }}
                        >
                            <Box
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1,
                                }}
                            >
                                <svg
                                    width="20"
                                    height="20"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v 3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                                </svg>
                                Register with GitHub
                            </Box>
                        </Button>
                        <Button
                            fullWidth
                            variant="outlined"
                            onClick={() => handleSSORegister("discord")}
                            sx={{
                                color: "var(--fg)",
                                borderColor: "var(--border)",
                                "&:hover": {
                                    borderColor: "var(--border)",
                                    backgroundColor: "var(--overlay)",
                                },
                                py: 1,
                                textTransform: "none",
                                fontSize: "0.95rem",
                                fontWeight: 500,
                            }}
                        >
                            <Box
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1,
                                }}
                            >
                                <svg
                                    width="20"
                                    height="20"
                                    viewBox="0 0 24 24"
                                    fill="#5865F2"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.418 2.157-2.418 1.21 0 2.176 1.094 2.157 2.418 0 1.334-.956 2.42-2.157 2.42zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.21 0 2.176 1.094 2.157 2.418 0 1.334-.946 2.42-2.157 2.42z" />
                                </svg>
                                Register with Discord
                            </Box>
                        </Button>
                        <Button
                            fullWidth
                            variant="outlined"
                            onClick={() => handleSSORegister("microsoft")}
                            sx={{
                                color: "var(--fg)",
                                borderColor: "var(--border)",
                                "&:hover": {
                                    borderColor: "var(--border)",
                                    backgroundColor: "var(--overlay)",
                                },
                                py: 1,
                                textTransform: "none",
                                fontSize: "0.95rem",
                                fontWeight: 500,
                            }}
                        >
                            <Box
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1,
                                }}
                            >
                                <svg
                                    width="20"
                                    height="20"
                                    viewBox="0 0 23 23"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path d="M0 0h11v11H0z" fill="#F25022" />
                                    <path d="M12 0h11v11H12z" fill="#7FBA00" />
                                    <path d="M0 12h11v11H0z" fill="#00A4EF" />
                                    <path d="M12 12h11v11H12z" fill="#FFB900" />
                                </svg>
                                Register with Microsoft
                            </Box>
                        </Button>
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};

const RegisterPage = () => (
    <Suspense>
        <RegisterContent />
    </Suspense>
);

export default RegisterPage;
