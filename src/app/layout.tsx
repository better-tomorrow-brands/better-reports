import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import {
  ClerkProvider,
  SignIn,
  SignedIn,
  SignedOut,
} from "@clerk/nextjs";
import TopBar from "@/components/TopBar";
import AppShell from "@/components/AppShell";
import { OrgProvider } from "@/contexts/OrgContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Better Reports",
  description: "Analytics and campaign management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <head>
          {/* Apply dark class before first paint to prevent flash */}
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
            }}
          />
        </head>
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          <SignedOut>
            <div className="flex h-screen items-center justify-center">
              <SignIn />
            </div>
          </SignedOut>
          <SignedIn>
            <ThemeProvider>
              <OrgProvider>
                <div className="flex flex-col h-screen bg-white dark:bg-black">
                  {/* Top Bar */}
                  <TopBar />

                  {/* AppShell wraps Sidebar + Page Content (Sidebar stays mounted) */}
                  <AppShell>
                    {children}
                  </AppShell>
                </div>
              </OrgProvider>
            </ThemeProvider>
          </SignedIn>
        </body>
      </html>
    </ClerkProvider>
  );
}
