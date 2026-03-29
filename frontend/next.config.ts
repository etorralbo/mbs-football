import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              // Only load scripts from self and Supabase (auth widget)
              "default-src 'self'",
              // Styles: self + inline (Tailwind injects inline styles)
              "style-src 'self' 'unsafe-inline'",
              // Scripts: self + inline eval needed by Next.js dev HMR; tighten in prod if needed
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              // Images: self + YouTube thumbnail CDN
              "img-src 'self' data: https://img.youtube.com",
              // Frames: only youtube-nocookie.com (privacy-enhanced embed)
              "frame-src https://www.youtube-nocookie.com",
              // Connections: self + backend API + Supabase
              "connect-src 'self' " + (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000") + " https://*.supabase.co wss://*.supabase.co",
              // Block <object> and <embed> tags
              "object-src 'none'",
              // Prevent framing of this app by others
              "frame-ancestors 'none'",
            ].join("; "),
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
