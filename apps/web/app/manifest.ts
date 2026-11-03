import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "IPO Singh",
    short_name: "IPO Singh",
    description: "All IPO insights. One place.",
    start_url: "/",
    display: "standalone",
    background_color: "#F8FAFC",
    theme_color: "#16A34A",
    icons: [
      {
        src: "/brand/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
