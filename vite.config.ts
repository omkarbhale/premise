import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The page (decision 0069): built from web/ into dist/web, which the server serves.
export default defineConfig({
  root: "web",
  plugins: [react()],
  build: { outDir: "../dist/web", emptyOutDir: true },
});
