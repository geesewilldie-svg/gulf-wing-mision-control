import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/nexus", name: "Nexus Personal Assistant", short_name: "Nexus",
    description: "Your connected personal assistant.",
    start_url: "/nexus", scope: "/", display: "standalone",
    background_color: "#07111c", theme_color: "#07111c",
    icons: [192, 512].map(size => ({ src: `/icons/nexus-${size}.png`, sizes: `${size}x${size}`, type: "image/png", purpose: "any" })),
  };
}
