import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Roster files (CSV, XLSX, PDF) are uploaded through a server action.
    // Lambda caps request payloads at 6 MB, and a file arrives base64-encoded
    // (a third larger), so 4 MB is the most that fits.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
