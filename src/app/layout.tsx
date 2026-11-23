import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Man Hour System",
  description: "Ahmadiah man-hour tracking",
  icons: { icon: "/ahmadiah-a.png", apple: "/icon-192.png" },
  appleWebApp: { capable: true, title: "Man Hours", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#e3262b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
