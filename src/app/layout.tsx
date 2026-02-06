import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import {
  ClerkProvider,
  SignIn,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";
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
      <html lang="en">
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          <SignedOut>
            <div className="flex h-screen items-center justify-center">
              <SignIn />
            </div>
          </SignedOut>
          <SignedIn>
            <div className="flex h-screen">
              <aside className="flex flex-col w-56 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                <div className="px-5 py-4">
                  <Link href="/" className="font-semibold text-lg">
                    Better Reports
                  </Link>
                </div>
                <nav className="flex flex-col gap-1 px-3 text-sm flex-1">
                  <Link href="/" className="px-3 py-2 rounded-md text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800">
                    Dashboard
                  </Link>
                  <Link href="/reports" className="px-3 py-2 rounded-md text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800">
                    Reports
                  </Link>
                  <Link href="/orders" className="px-3 py-2 rounded-md text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800">
                    Orders
                  </Link>
                  <Link href="/campaigns" className="px-3 py-2 rounded-md text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800">
                    Campaigns
                  </Link>
                  <Link href="/customers" className="px-3 py-2 rounded-md text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800">
                    Customers
                  </Link>
                  <Link href="/campaign-sender" className="px-3 py-2 rounded-md text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800">
                    WhatsApp
                  </Link>
                  <Link href="/settings" className="px-3 py-2 rounded-md text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800">
                    Settings
                  </Link>
                </nav>
                <div className="px-5 py-4 border-t border-zinc-200 dark:border-zinc-800">
                  <UserButton showName />
                </div>
              </aside>
              <main className="flex-1 overflow-hidden">{children}</main>
            </div>
          </SignedIn>
        </body>
      </html>
    </ClerkProvider>
  );
}
