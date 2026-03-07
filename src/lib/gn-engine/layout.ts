import type { GnGraph } from "./types";
import { renderDot, type Engine } from "../graphviz";

export async function autoLayout(graph: GnGraph, originalDot: string, engine: Engine = "dot"): Promise<void> {
    try {
        const svgStr = await renderDot(originalDot, engine);
        extractPositions(graph, svgStr);
        // Check if extraction worked — if most nodes still at 0,0 do fallback
        let zeroCount = 0;
        graph.nodes.forEach((n) => { if (n.x === 0 && n.y === 0) zeroCount++; });
        if (zeroCount > graph.nodes.size * 0.5 && graph.nodes.size > 1) fallbackLayout(graph);
    } catch {
        fallbackLayout(graph);
    }
}

export function fallbackLayout(graph: GnGraph) {
    const nodes = Array.from(graph.nodes.values());
    const cols = Math.max(Math.ceil(Math.sqrt(nodes.length)), 1);
    const spacingX = 200, spacingY = 140;
    nodes.forEach((n, i) => {
        n.x = (i % cols) * spacingX + spacingX / 2;
        n.y = Math.floor(i / cols) * spacingY + spacingY / 2;
    });
}

function extractPositions(graph: GnGraph, svgStr: string) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgStr, "image/svg+xml");
    const svg = doc.querySelector("svg");
    if (!svg) { fallbackLayout(graph); return; }

    const graphG = svg.querySelector("g.graph");
    if (!graphG) { fallbackLayout(graph); return; }

    graphG.querySelectorAll(":scope > g.node, g.node").forEach((g) => {
        const title = g.querySelector("title")?.textContent?.trim();
        if (!title || title === "\\n" || title.length === 0) return;

        // title might be "%3" for the graph itself
        const node = graph.nodes.get(title);
        if (!node) return;

        const ellipse = g.querySelector("ellipse");
        const polygon = g.querySelector("polygon");
        const polyline = g.querySelector("polyline");
        const rect = g.querySelector("rect");
        const text = g.querySelector("text");

        if (ellipse) {
            node.x = parseFloat(ellipse.getAttribute("cx") || "0");
            node.y = parseFloat(ellipse.getAttribute("cy") || "0");
            const rx = parseFloat(ellipse.getAttribute("rx") || "30");
            const ry = parseFloat(ellipse.getAttribute("ry") || "20");
            node.width = rx * 2;
            node.height = ry * 2;
        } else if (polygon) {
            const pts = polygon.getAttribute("points") || "";
            const coords = pts.trim().split(/\s+/).map((p) => {
                const [x, y] = p.split(",").map(Number);
                return { x: x || 0, y: y || 0 };
            }).filter((c) => !isNaN(c.x) && !isNaN(c.y));
            if (coords.length >= 3) {
                const xs = coords.map((c) => c.x);
                const ys = coords.map((c) => c.y);
                const minX = Math.min(...xs), maxX = Math.max(...xs);
                const minY = Math.min(...ys), maxY = Math.max(...ys);
                node.x = (minX + maxX) / 2;
                node.y = (minY + maxY) / 2;
                node.width = Math.max(maxX - minX, 40);
                node.height = Math.max(maxY - minY, 24);
            }
        } else if (rect) {
            const rx = parseFloat(rect.getAttribute("x") || "0");
            const ry = parseFloat(rect.getAttribute("y") || "0");
            const rw = parseFloat(rect.getAttribute("width") || "80");
            const rh = parseFloat(rect.getAttribute("height") || "36");
            node.x = rx + rw / 2;
            node.y = ry + rh / 2;
            node.width = rw;
            node.height = rh;
        } else if (text) {
            node.x = parseFloat(text.getAttribute("x") || "0");
            node.y = parseFloat(text.getAttribute("y") || "0");
            if (!node.width) node.width = 60;
            if (!node.height) node.height = 30;
        }
    });
}
