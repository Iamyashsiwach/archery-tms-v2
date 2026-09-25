import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Roster files (CSV, XLSX, PDF) are uploaded through a server action.
    // Vercel caps function request bodies at 4.5 MB.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
