import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Loaded from node_modules at runtime (tesseract.js starts its own worker thread).
  serverExternalPackages: ["tesseract.js", "exceljs"],
};

export default nextConfig;
