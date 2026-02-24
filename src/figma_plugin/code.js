// Figma MCP Plugin — code.js
// Runs in Figma's sandbox. Receives commands from ui.html and responds back.

figma.showUI(__html__, { width: 320, height: 280, title: "Figma MCP Plugin" });

// ─── Helpers ──────────────────────────────────────────────────────────────────
function rgbToHex(r, g, b) {
  const toHex = (v) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function serializeNode(node) {
  const base = {
    id: node.id,
    name: node.name,
    type: node.type,
    x: "x" in node ? node.x : undefined,
    y: "y" in node ? node.y : undefined,
    width: "width" in node ? node.width : undefined,
    height: "height" in node ? node.height : undefined,
    visible: node.visible,
  };

  if ("fills" in node && Array.isArray(node.fills)) {
    base.fills = node.fills.map((f) => {
      if (f.type === "SOLID") {
        return { type: "SOLID", color: rgbToHex(f.color.r, f.color.g, f.color.b), opacity: f.opacity ?? 1 };
      }
      return { type: f.type };
    });
  }

  if (node.type === "TEXT") {
    base.characters = node.characters;
    base.fontSize = node.fontSize;
  }

  if ("children" in node) {
    base.childCount = node.children.length;
    base.children = node.children.map((c) => serializeNode(c));
  }

  return base;
}

// ─── Command handlers ─────────────────────────────────────────────────────────
const handlers = {
  get_document_info() {
    const doc = figma.root;
    return {
      id: doc.id,
      name: doc.name,
      type: doc.type,
      pageCount: doc.children.length,
      pages: doc.children.map((p) => ({ id: p.id, name: p.name })),
      currentPage: { id: figma.currentPage.id, name: figma.currentPage.name },
    };
  },

  get_selection() {
    const sel = figma.currentPage.selection;
    return { count: sel.length, nodes: sel.map(serializeNode) };
  },

  get_node_info({ nodeId }) {
    const node = figma.getNodeById(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    return serializeNode(node);
  },

  get_nodes_info({ nodeIds }) {
    return nodeIds.map((id) => {
      const node = figma.getNodeById(id);
      return node ? serializeNode(node) : { id, error: "Not found" };
    });
  },

  get_styles() {
    return {
      paint: figma.getLocalPaintStyles().map((s) => ({ id: s.id, name: s.name, type: "PAINT" })),
      text: figma.getLocalTextStyles().map((s) => ({ id: s.id, name: s.name, type: "TEXT" })),
      effect: figma.getLocalEffectStyles().map((s) => ({ id: s.id, name: s.name, type: "EFFECT" })),
      grid: figma.getLocalGridStyles().map((s) => ({ id: s.id, name: s.name, type: "GRID" })),
    };
  },

  get_local_components() {
    return figma.root.findAll((n) => n.type === "COMPONENT").map((n) => ({
      id: n.id,
      name: n.name,
      description: n.description ?? "",
    }));
  },

  create_rectangle({ x = 0, y = 0, width = 100, height = 100, color, name }) {
    const rect = figma.createRectangle();
    rect.x = x; rect.y = y;
    rect.resize(width, height);
    if (name) rect.name = name;
    if (color) rect.fills = [{ type: "SOLID", color: { r: color.r, g: color.g, b: color.b }, opacity: color.a ?? 1 }];
    figma.currentPage.appendChild(rect);
    figma.currentPage.selection = [rect];
    figma.viewport.scrollAndZoomIntoView([rect]);
    return serializeNode(rect);
  },

  async create_text({ x = 0, y = 0, text = "Hello", fontSize = 16, color, name }) {
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    const t = figma.createText();
    t.x = x; t.y = y;
    t.characters = text;
    t.fontSize = fontSize;
    if (name) t.name = name;
    if (color) t.fills = [{ type: "SOLID", color: { r: color.r, g: color.g, b: color.b }, opacity: color.a ?? 1 }];
    figma.currentPage.appendChild(t);
    figma.currentPage.selection = [t];
    figma.viewport.scrollAndZoomIntoView([t]);
    return serializeNode(t);
  },

  create_frame({ x = 0, y = 0, width = 375, height = 812, name, backgroundColor }) {
    const frame = figma.createFrame();
    frame.x = x; frame.y = y;
    frame.resize(width, height);
    if (name) frame.name = name;
    if (backgroundColor) {
      frame.fills = [{ type: "SOLID", color: { r: backgroundColor.r, g: backgroundColor.g, b: backgroundColor.b }, opacity: backgroundColor.a ?? 1 }];
    }
    figma.currentPage.appendChild(frame);
    figma.currentPage.selection = [frame];
    figma.viewport.scrollAndZoomIntoView([frame]);
    return serializeNode(frame);
  },

  set_fill_color({ nodeId, color }) {
    const node = figma.getNodeById(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    if (!("fills" in node)) throw new Error("Node does not support fills");
    node.fills = [{ type: "SOLID", color: { r: color.r, g: color.g, b: color.b }, opacity: color.a ?? 1 }];
    return { success: true, nodeId };
  },

  move_node({ nodeId, x, y }) {
    const node = figma.getNodeById(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    if (!("x" in node)) throw new Error("Node does not support position");
    node.x = x; node.y = y;
    return { success: true, nodeId, x, y };
  },

  resize_node({ nodeId, width, height }) {
    const node = figma.getNodeById(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    if (!("resize" in node)) throw new Error("Node does not support resize");
    node.resize(width, height);
    return { success: true, nodeId, width, height };
  },

  delete_node({ nodeId }) {
    const node = figma.getNodeById(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    node.remove();
    return { success: true, nodeId };
  },

  async set_text_content({ nodeId, text }) {
    const node = figma.getNodeById(nodeId);
    if (!node || node.type !== "TEXT") throw new Error(`Text node not found: ${nodeId}`);
    await figma.loadFontAsync(node.fontName);
    node.characters = text;
    return { success: true, nodeId };
  },

  async export_node_as_image({ nodeId, format = "PNG", scale = 1 }) {
    const node = figma.getNodeById(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    const bytes = await node.exportAsync({ format, constraint: { type: "SCALE", value: scale } });
    return { success: true, nodeId, format, byteLength: bytes.byteLength };
  },
};

// ─── Message listener ─────────────────────────────────────────────────────────
figma.ui.onmessage = async (msg) => {
  if (msg.type !== "figma_command") return;

  const { id, command, params = {} } = msg;
  try {
    const handler = handlers[command];
    if (!handler) throw new Error(`Unknown command: ${command}`);
    const result = await Promise.resolve(handler(params));
    figma.ui.postMessage({ id, result });
  } catch (err) {
    figma.ui.postMessage({ id, error: err.message });
  }
};
