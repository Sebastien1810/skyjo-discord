/** @type {import('next').NextConfig} */
const nextConfig = {
  // Désactive le header "X-Powered-By: Next.js" en prod
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Requis pour Discord Activity (iframe cross-origin)
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
