/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "26mb" },
  },
  // Browsers auto-request /favicon.ico regardless of <link rel="icon">.
  // Next 16's app/icon.svg convention populates the metadata link
  // tags, but the literal /favicon.ico path 500s under Turbopack when
  // there's no app/favicon.ico file to back it. Rewriting to /icon
  // routes the browser's auto-request to the same SVG Next is already
  // serving for the metadata link.
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/icon" }];
  },
};

export default nextConfig;
