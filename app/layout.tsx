import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Letterpress — Email studio",
  description: "Compose, preview, and send email with Resend.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
