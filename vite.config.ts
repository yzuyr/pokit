import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  base: "/pokit/",
  plugins: [
    svelte(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: { enabled: true },
      includeAssets: ["pokit.svg", "180.png", "192.png", "512.png"],
      manifest: {
        name: "Pokit - Pocket Synth",
        short_name: "Pokit",
        description: "The pocket synth.",
        theme_color: "#ff6900",
        icons: [
          {
            src: "192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    }),
  ],
});
