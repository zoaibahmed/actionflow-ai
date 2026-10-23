import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { MotionProvider } from "@/components/motion/provider";
import { Diagnostics } from "@/components/dev/diagnostics";
const geistSans = localFont({
  src: "./fonts/geist-latin.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
});
const geistMono = localFont({
  src: "./fonts/geist-mono-latin.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});
export const metadata: Metadata = {
  title: "ActionFlow AI | A clearer day",
  referrer: "no-referrer",
  description:
    "A thoughtful personal workspace for your tasks, priorities, and daily plans.",
};
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <MotionProvider>{children}</MotionProvider>
        {process.env.NODE_ENV === "development" &&
          process.env.DIAGNOSTICS_ENABLED === "1" && <Diagnostics />}
      </body>
    </html>
  );
}
