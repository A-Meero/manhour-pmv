import type { MetadataRoute } from "next";

/** "Install as app" / "Add to Home Screen": opens full screen with the company icon. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Man Hour System",
    short_name: "Man Hours",
    description: "Ahmadiah man-hour tracking",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#e3262b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
