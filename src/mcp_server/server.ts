#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";

// ─── Logger (stderr to avoid polluting MCP stdout) ────────────────────────────
const log = {
  info: (m: string) => process.stderr.write(`[INFO] ${m}\n`),
  warn: (m: string) => process.stderr.write(`[WARN] ${m}\n`),
  error: (m: string) => process.stderr.write(`[ERROR] ${m}\n`),
};

// ─── Types ─────────────────────────────────────────────────────────────────────
interface FigmaResponse {
  id: string;
  result?: unknown;
  error?: string;
}

// ─── WebSocket state ───────────────────────────────────────────────────────────
const WS_URL = "ws://localhost:3055";
const CHANNEL = "figma-mcp";
const TIMEOUT_MS = 30_000;

let ws: WebSocket | null = null;
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function connect(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws?.readyState === WebSocket.OPEN) { resolve(); return; }

    ws = new WebSocket(WS_URL);

    ws.once("open", () => {
      log.info("Connected to WebSocket server");
      ws!.send(JSON.stringify({ type: "join", channel: CHANNEL, id: uuidv4() }));
      resolve();
    });

    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.type === "broadcast" && data.message) {
          const msg = data.message as FigmaResponse;
          const handler = pending.get(msg.id);
          if (handler) {
            pending.delete(msg.id);
            if (msg.error) handler.reject(new Error(msg.error));
            else handler.resolve(msg.result);
          }
        }
      } catch { /* ignore */ }
    });

    ws.on("error", (err) => {
      log.error(`WebSocket error: ${err.message}`);
      reject(err);
    });

    ws.on("close", () => {
      log.warn("WebSocket closed");
      ws = null;
    });
  });
}

async function sendCommand(command: string, params: Record<string, unknown> = {}): Promise<unknown> {
  await connect();
  const id = uuidv4();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timeout waiting for Figma response (command: ${command})`));
    }, TIMEOUT_MS);

    pending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });

    ws!.send(JSON.stringify({ type: "message", channel: CHANNEL, message: { id, command, params } }));
  });
}

// ─── MCP Server ────────────────────────────────────────────────────────────────
const server = new McpServer({
  name: "figma-mcp",
  version: "0.1.0",
});

// ── Tool: get_document_info ──
server.tool("get_document_info", "Get basic info about the current Figma document", {}, async () => {
  const result = await sendCommand("get_document_info");
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});

// ── Tool: get_selection ──
server.tool("get_selection", "Get the currently selected nodes in Figma", {}, async () => {
  const result = await sendCommand("get_selection");
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});

// ── Tool: get_node_info ──
server.tool(
  "get_node_info",
  "Get detailed info about a specific Figma node by ID",
  { nodeId: z.string().describe("The ID of the Figma node") },
  async ({ nodeId }) => {
    const result = await sendCommand("get_node_info", { nodeId });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: get_nodes_info ──
server.tool(
  "get_nodes_info",
  "Get detailed info about multiple Figma nodes",
  { nodeIds: z.array(z.string()).describe("Array of node IDs") },
  async ({ nodeIds }) => {
    const result = await sendCommand("get_nodes_info", { nodeIds });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: get_styles ──
server.tool("get_styles", "Get all styles defined in the Figma document", {}, async () => {
  const result = await sendCommand("get_styles");
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});

// ── Tool: get_local_components ──
server.tool("get_local_components", "Get all local components in the Figma document", {}, async () => {
  const result = await sendCommand("get_local_components");
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});

// ── Tool: create_rectangle ──
server.tool(
  "create_rectangle",
  "Create a rectangle in Figma",
  {
    x: z.number().describe("X position"),
    y: z.number().describe("Y position"),
    width: z.number().describe("Width"),
    height: z.number().describe("Height"),
    color: z.object({
      r: z.number().min(0).max(1),
      g: z.number().min(0).max(1),
      b: z.number().min(0).max(1),
      a: z.number().min(0).max(1).optional(),
    }).optional().describe("Fill color (RGBA, values 0–1)"),
    name: z.string().optional().describe("Layer name"),
  },
  async (params) => {
    const result = await sendCommand("create_rectangle", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: create_text ──
server.tool(
  "create_text",
  "Create a text node in Figma",
  {
    x: z.number().describe("X position"),
    y: z.number().describe("Y position"),
    text: z.string().describe("Text content"),
    fontSize: z.number().optional().describe("Font size"),
    color: z.object({
      r: z.number().min(0).max(1),
      g: z.number().min(0).max(1),
      b: z.number().min(0).max(1),
      a: z.number().min(0).max(1).optional(),
    }).optional().describe("Text color (RGBA, values 0–1)"),
    name: z.string().optional().describe("Layer name"),
  },
  async (params) => {
    const result = await sendCommand("create_text", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: create_frame ──
server.tool(
  "create_frame",
  "Create a frame in Figma",
  {
    x: z.number().describe("X position"),
    y: z.number().describe("Y position"),
    width: z.number().describe("Width"),
    height: z.number().describe("Height"),
    name: z.string().optional().describe("Frame name"),
    backgroundColor: z.object({
      r: z.number().min(0).max(1),
      g: z.number().min(0).max(1),
      b: z.number().min(0).max(1),
      a: z.number().min(0).max(1).optional(),
    }).optional().describe("Background color (RGBA, values 0–1)"),
  },
  async (params) => {
    const result = await sendCommand("create_frame", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: set_fill_color ──
server.tool(
  "set_fill_color",
  "Set the fill color of a Figma node",
  {
    nodeId: z.string().describe("Node ID"),
    color: z.object({
      r: z.number().min(0).max(1),
      g: z.number().min(0).max(1),
      b: z.number().min(0).max(1),
      a: z.number().min(0).max(1).optional(),
    }).describe("Fill color (RGBA, values 0–1)"),
  },
  async (params) => {
    const result = await sendCommand("set_fill_color", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: move_node ──
server.tool(
  "move_node",
  "Move a Figma node to a new position",
  {
    nodeId: z.string().describe("Node ID"),
    x: z.number().describe("New X position"),
    y: z.number().describe("New Y position"),
  },
  async (params) => {
    const result = await sendCommand("move_node", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: resize_node ──
server.tool(
  "resize_node",
  "Resize a Figma node",
  {
    nodeId: z.string().describe("Node ID"),
    width: z.number().describe("New width"),
    height: z.number().describe("New height"),
  },
  async (params) => {
    const result = await sendCommand("resize_node", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: delete_node ──
server.tool(
  "delete_node",
  "Delete a node from Figma",
  { nodeId: z.string().describe("Node ID to delete") },
  async ({ nodeId }) => {
    const result = await sendCommand("delete_node", { nodeId });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: set_text_content ──
server.tool(
  "set_text_content",
  "Update the text content of a text node",
  {
    nodeId: z.string().describe("Node ID of the text node"),
    text: z.string().describe("New text content"),
  },
  async (params) => {
    const result = await sendCommand("set_text_content", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Tool: export_node_as_image ──
server.tool(
  "export_node_as_image",
  "Export a Figma node as an image (PNG/SVG/PDF)",
  {
    nodeId: z.string().describe("Node ID to export"),
    format: z.enum(["PNG", "SVG", "PDF", "JPG"]).optional().describe("Export format (default: PNG)"),
    scale: z.number().optional().describe("Export scale (default: 1)"),
  },
  async (params) => {
    const result = await sendCommand("export_node_as_image", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ─── Start ─────────────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info("Figma MCP server started (stdio)");
}

main().catch((err) => {
  log.error(`Fatal: ${err.message}`);
  process.exit(1);
});
