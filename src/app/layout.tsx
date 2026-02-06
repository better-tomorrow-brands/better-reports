import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import {
  ClerkProvider,
  SignIn,
  SignedIn,
  SignedOut,
} from "@clerk/nextjs";
import Sidebar from "@/components/Sidebar";
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
              <Sidebar />
              <main className="flex-1 overflow-auto">{children}</main>
            </div>
          </SignedIn>
        </body>
      </html>
    </ClerkProvider>
  );
}
