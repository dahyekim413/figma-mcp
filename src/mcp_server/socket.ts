import { Server, ServerWebSocket } from "bun";

const PORT = 3055;

// Store clients by channel
const channels = new Map<string, Set<ServerWebSocket<unknown>>>();

function removeFromChannels(ws: ServerWebSocket<unknown>) {
  channels.forEach((clients, channelName) => {
    if (clients.has(ws)) {
      clients.delete(ws);
      broadcast(channelName, { type: "system", message: "A user has left the channel" }, null);
    }
  });
}

function broadcast(
  channelName: string,
  data: object,
  exclude: ServerWebSocket<unknown> | null
) {
  const clients = channels.get(channelName);
  if (!clients) return;
  const payload = JSON.stringify(data);
  clients.forEach((client) => {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

const server = Bun.serve({
  port: PORT,
  fetch(req: Request, server: Server) {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    const upgraded = server.upgrade(req, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
    if (upgraded) return;

    return new Response("Figma MCP WebSocket server is running.", {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  },
  websocket: {
    open(ws: ServerWebSocket<unknown>) {
      console.log("[WS] New client connected");
      ws.send(JSON.stringify({ type: "system", message: "Connected. Join a channel to start." }));
    },
    message(ws: ServerWebSocket<unknown>, raw: string | Buffer) {
      try {
        const data = JSON.parse(raw as string);

        if (data.type === "join") {
          const ch: string = data.channel;
          if (!ch) {
            ws.send(JSON.stringify({ type: "error", message: "channel is required" }));
            return;
          }
          if (!channels.has(ch)) channels.set(ch, new Set());
          channels.get(ch)!.add(ws);

          ws.send(JSON.stringify({ type: "system", message: `Joined channel: ${ch}`, channel: ch }));
          ws.send(JSON.stringify({ type: "system", message: { id: data.id, result: `Connected to channel: ${ch}` }, channel: ch }));
          broadcast(ch, { type: "system", message: "A new user joined", channel: ch }, ws);
          console.log(`[WS] Client joined channel: ${ch}`);
          return;
        }

        if (data.type === "message") {
          const ch: string = data.channel;
          const clients = channels.get(ch);
          if (!clients?.has(ws)) {
            ws.send(JSON.stringify({ type: "error", message: "Join a channel first" }));
            return;
          }
          console.log(`[WS] Broadcasting to channel ${ch}:`, data.message);
          clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: "broadcast",
                message: data.message,
                sender: client === ws ? "You" : "Remote",
                channel: ch,
              }));
            }
          });
        }
      } catch (err) {
        console.error("[WS] Parse error:", err);
      }
    },
    close(ws: ServerWebSocket<unknown>) {
      console.log("[WS] Client disconnected");
      removeFromChannels(ws);
    },
  },
});

console.log(`[WS] WebSocket server running on ws://localhost:${server.port}`);
