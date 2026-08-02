import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://webhook-master-nikhil.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Webhook Delivery — Reliable webhook infrastructure",
    template: "%s | Webhook Delivery",
  },
  description:
    "Ingest events once. We sign, deliver, retry, and log every webhook attempt. HMAC signatures, team invites, replay, and analytics — without building your own queue.",
  applicationName: "Webhook Delivery",
  keywords: [
    "webhooks",
    "webhook delivery",
    "event delivery",
    "retry",
    "HMAC",
    "API",
    "developer tools",
  ],
  authors: [{ name: "Webhook Delivery" }],
  creator: "Webhook Delivery",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "Webhook Delivery",
    title: "Webhook Delivery",
    description:
      "Reliable webhook delivery with retries, signing, analytics, and a developer dashboard.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Webhook Delivery",
    description:
      "Reliable webhook delivery with retries, signing, analytics, and a developer dashboard.",
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon.svg", type: "image/svg+xml" }],
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
