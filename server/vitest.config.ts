import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Load .env before tests run, mirroring the server entrypoint so tests that
    // read config (e.g. CZKAWKA_BIN, DATA_DIR) see the same values as `npm run dev`.
    setupFiles: ["dotenv/config"],
  },
});
