import type { Metadata } from "next";
import { Toaster } from "sonner";
import { AuthProvider } from "@/components/AuthProvider";
import "./global.css";

export const metadata: Metadata = {
  title: "Elixpo Chat",
  description:
    "Your personalized hub for news, weather, podcasts, and more. Stay informed with Elixpo Daily, weather updates, and engaging podcasts.",
  keywords: [
    "Elixpo Chat",
    "news",
    "weather",
    "podcasts",
    "daily updates",
    "weather forecast",
    "podcast player",
  ],
  openGraph: {
    type: "website",
    url: "https://chat.elixpo.com/",
    title: "Elixpo Chat - Connect, Stay Informed, Explore",
    description:
      "Your personalized hub for news, weather, podcasts, and more.",
    images: [
      "https://github.com/user-attachments/assets/ab767204-588d-4367-8551-7ac43d523e1b",
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@elixpo",
    title: "Elixpo Chat - Connect, Stay Informed, Explore",
    description:
      "Your personalized hub for news, weather, podcasts, and more.",
    images: [
      "https://github.com/user-attachments/assets/ab767204-588d-4367-8551-7ac43d523e1b",
    ],
  },
  icons: { icon: "/images/logo.png" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Instrument+Serif&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <AuthProvider>
          {children}
        </AuthProvider>
        <Toaster
          position="bottom-right"
          richColors
          toastOptions={{
            style: {
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            },
          }}
        />
      </body>
    </html>
  );
}
