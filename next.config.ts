import type { NextConfig } from "next";

function parseAllowedImageHosts(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[,\s]+/)
    .map((host) => host.trim())
    .filter(Boolean);
}

function buildRemoteImagePatterns() {
  const hosts = parseAllowedImageHosts(process.env.NEXT_IMAGE_ALLOWED_HOSTS);
  return hosts.map((hostname) => ({
    protocol: "https" as const,
    hostname,
  }));
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: buildRemoteImagePatterns(),
  },
};

export default nextConfig;
