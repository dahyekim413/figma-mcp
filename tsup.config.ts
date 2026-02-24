import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    server: "src/mcp_server/server.ts",
    socket: "src/mcp_server/socket.ts",
  },
  format: ["esm"],
  target: "node18",
  shims: true,
  clean: true,
});
