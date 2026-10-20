import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const realApi = fileURLToPath(new URL("./src/services/badmintonApi.js", import.meta.url));
const mockApi = fileURLToPath(new URL("./src/mocks/badmintonApi.mock.js", import.meta.url));

// Temporary: the pages import services/badmintonApi, which isn't committed
// yet. Until it is, those imports load the mock in src/mocks instead. Once the
// real file exists this does nothing, unless VITE_USE_MOCK_API=true is set.
// Delete this plugin and src/mocks when the mocks are no longer needed.
function mockBadmintonApi(useMock) {
  return {
    name: "mock-badminton-api",
    enforce: "pre",
    resolveId(source) {
      if (!/(^|\/)badmintonApi(\.js)?$/.test(source)) return null;
      return useMock || !existsSync(realApi) ? mockApi : null;
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [mockBadmintonApi(loadEnv(mode, process.cwd()).VITE_USE_MOCK_API === "true")],
}));
