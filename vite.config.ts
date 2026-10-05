import react from "@vitejs/plugin-react";
import { resolvePagesBase } from "./config/pagesBase.ts";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: resolvePagesBase(process.env),
  worker: { format: "es" },
});
