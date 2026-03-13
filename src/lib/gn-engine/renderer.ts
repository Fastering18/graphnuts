import type { GnGraph, GnNode, GnEdge, GnCluster, GnShape, GnStyle, GnEdgeStyle } from "./types";
import { routeEdge } from "./edge-router";

const NS = "http://www.w3.org/2000/svg";
const ARROW_SIZE = 8;
const NODE_PAD_X = 16;
const NODE_PAD_Y = 10;

export function renderGraph(container: HTMLElement, graph: GnGraph): SVGSVGElement {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.overflow = "visible";
    svg.style.background = graph.bgcolor || "transparent";
    svg.setAttribute("data-bgcolor", graph.bgcolor || "transparent");

    const defs = document.createElementNS(NS, "defs");
    addArrowDef(defs, "arrow-normal", "#333");
    addGlowFilter(defs);
    svg.appendChild(defs);

    const root = document.createElementNS(NS, "g");
    root.setAttribute("class", "gn-root");
    svg.appendChild(root);

    // Render clusters
    graph.clusters.forEach((cluster) => renderCluster(root, cluster, graph));

    // Render edges
    graph.edges.forEach((edge, i) => {
        const fromNode = graph.nodes.get(edge.from);
        const toNode = graph.nodes.get(edge.to);
        if (fromNode && toNode) renderEdge(root, defs, edge, fromNode, toNode, i, graph.bgcolor);
    });

    // Render nodes
    graph.nodes.forEach((node) => renderNode(root, node));

    container.innerHTML = "";
    container.appendChild(svg);
    return svg;
}

export function updateEdges(svg: SVGSVGElement, graph: GnGraph) {
    const root = svg.querySelector("g.gn-root");
    if (!root) return;

    root.querySelectorAll("g.gn-edge").forEach((el) => el.remove());
    const defs = svg.querySelector("defs")!;

    graph.edges.forEach((edge, i) => {
        const fromNode = graph.nodes.get(edge.from);
        const toNode = graph.nodes.get(edge.to);
        if (fromNode && toNode) renderEdge(root, defs, edge, fromNode, toNode, i, graph.bgcolor);
    });

    // Re-append nodes on top of edges
    root.querySelectorAll("g.gn-node").forEach((n) => root.appendChild(n));
}

export function updateNodePosition(svg: SVGSVGElement, nodeId: string, x: number, y: number) {
    const g = svg.querySelector(`g.gn-node[data-id="${nodeId}"]`);
    if (g) g.setAttribute("transform", `translate(${x},${y})`);
}

export function updateClusterBounds(svg: SVGSVGElement, graph: GnGraph) {
    graph.clusters.forEach((cluster) => {
        computeClusterBounds(cluster, graph);
        const g = svg.querySelector(`g.gn-cluster[data-id="${cluster.id}"]`);
        if (!g) return;
        const rect = g.querySelector("rect");
        if (!rect) return;
        rect.setAttribute("x", String(cluster.x - cluster.width / 2));
        rect.setAttribute("y", String(cluster.y - cluster.height / 2));
        rect.setAttribute("width", String(cluster.width));
        rect.setAttribute("height", String(cluster.height));
    });
}

function renderNode(parent: Element, node: GnNode) {
    if (!node.width) measureNode(node);

    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", "gn-node");
    g.setAttribute("data-id", node.id);
    g.setAttribute("transform", `translate(${node.x},${node.y})`);
    g.style.cursor = "default";

    const shape = createShape(node);
    g.appendChild(shape);

    const lines = node.label.split("\n");
    lines.forEach((line, i) => {
        const text = document.createElementNS(NS, "text");
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "central");
        text.setAttribute("y", String((i - (lines.length - 1) / 2) * (node.style.fontSize + 2)));
        text.setAttribute("fill", node.style.fontColor);
        text.setAttribute("font-family", node.style.fontFamily);
        text.setAttribute("font-size", String(node.style.fontSize));
        text.textContent = line;
        text.style.pointerEvents = "none";
        text.style.userSelect = "none";
        g.appendChild(text);
    });

    parent.appendChild(g);
}

function createShape(node: GnNode): SVGElement {
    const s = node.style;
    const hw = node.width / 2, hh = node.height / 2;
    let el: SVGElement;

    const shape = node.shape;
    switch (shape) {
        case "ellipse":
        case "circle":
        case "oval":
            el = document.createElementNS(NS, "ellipse");
            el.setAttribute("rx", String(hw));
            el.setAttribute("ry", String(hh));
            break;

        case "doublecircle":
            el = document.createElementNS(NS, "ellipse");
            el.setAttribute("rx", String(hw));
            el.setAttribute("ry", String(hh));
            break;

        case "diamond":
        case "Mdiamond":
            el = document.createElementNS(NS, "polygon");
            el.setAttribute("points", `0,${-hh} ${hw},0 0,${hh} ${-hw},0`);
            break;

        case "hexagon":
            el = document.createElementNS(NS, "polygon");
            const hx = hw * 0.3;
            el.setAttribute("points",
                `${-hw + hx},${-hh} ${hw - hx},${-hh} ${hw},0 ${hw - hx},${hh} ${-hw + hx},${hh} ${-hw},0`);
            break;

        case "octagon": {
            const cx = hw * 0.3, cy = hh * 0.3;
            el = document.createElementNS(NS, "polygon");
            el.setAttribute("points",
                `${-hw + cx},${-hh} ${hw - cx},${-hh} ${hw},${-hh + cy} ${hw},${hh - cy} ${hw - cx},${hh} ${-hw + cx},${hh} ${-hw},${hh - cy} ${-hw},${-hh + cy}`);
            break;
        }

        case "house":
            el = document.createElementNS(NS, "polygon");
            el.setAttribute("points", `0,${-hh} ${hw},${-hh * 0.2} ${hw},${hh} ${-hw},${hh} ${-hw},${-hh * 0.2}`);
            break;

        case "invhouse":
            el = document.createElementNS(NS, "polygon");
            el.setAttribute("points", `${-hw},${-hh} ${hw},${-hh} ${hw},${hh * 0.2} 0,${hh} ${-hw},${hh * 0.2}`);
            break;

        case "triangle":
        case "invtriangle": {
            const inv = shape === "invtriangle";
            el = document.createElementNS(NS, "polygon");
            el.setAttribute("points", inv
                ? `${-hw},${-hh} ${hw},${-hh} 0,${hh}`
                : `0,${-hh} ${hw},${hh} ${-hw},${hh}`);
            break;
        }

        case "parallelogram": {
            const sk = hw * 0.2;
            el = document.createElementNS(NS, "polygon");
            el.setAttribute("points", `${-hw + sk},${-hh} ${hw + sk},${-hh} ${hw - sk},${hh} ${-hw - sk},${hh}`);
            break;
        }

        case "cylinder": {
            el = document.createElementNS(NS, "path");
            const ry = hh * 0.2;
            el.setAttribute("d",
                `M${-hw},${-hh + ry} A${hw},${ry} 0 0,1 ${hw},${-hh + ry} V${hh - ry} A${hw},${ry} 0 0,1 ${-hw},${hh - ry} Z`
            );
            // Top cap
            const cap = document.createElementNS(NS, "ellipse");
            cap.setAttribute("cx", "0");
            cap.setAttribute("cy", String(-hh + ry));
            cap.setAttribute("rx", String(hw));
            cap.setAttribute("ry", String(ry));
            cap.setAttribute("fill", "none");
            cap.setAttribute("stroke", s.stroke);
            cap.setAttribute("stroke-width", String(s.strokeWidth));
            break;
        }

        case "star": {
            el = document.createElementNS(NS, "polygon");
            const pts: string[] = [];
            for (let i = 0; i < 10; i++) {
                const angle = (i * Math.PI) / 5 - Math.PI / 2;
                const r = i % 2 === 0 ? Math.min(hw, hh) : Math.min(hw, hh) * 0.45;
                pts.push(`${r * Math.cos(angle)},${r * Math.sin(angle)}`);
            }
            el.setAttribute("points", pts.join(" "));
            break;
        }

        case "plaintext":
        case "plain":
        case "none":
            el = document.createElementNS(NS, "rect");
            el.setAttribute("x", String(-hw)); el.setAttribute("y", String(-hh));
            el.setAttribute("width", String(node.width)); el.setAttribute("height", String(node.height));
            el.setAttribute("fill", "transparent");
            el.setAttribute("stroke", "none");
            return el;

        default: // box, rect, rectangle, square, record, Mrecord, etc.
            el = document.createElementNS(NS, "rect");
            el.setAttribute("x", String(-hw));
            el.setAttribute("y", String(-hh));
            el.setAttribute("width", String(node.width));
            el.setAttribute("height", String(node.height));
            if (s.rounded) el.setAttribute("rx", "6");
            break;
    }

    el.setAttribute("fill", s.filled ? s.fill : "white");
    el.setAttribute("stroke", s.stroke);
    el.setAttribute("stroke-width", String(s.bold ? s.strokeWidth * 2 : s.strokeWidth));
    if (s.dashed) el.setAttribute("stroke-dasharray", "6,3");
    if (s.dotted) el.setAttribute("stroke-dasharray", "2,3");

    return el;
}

function renderEdge(parent: Element, defs: Element, edge: GnEdge, from: GnNode, to: GnNode, idx: number, bgcolor?: string) {
    const arrowId = `arrow-${idx}`;
    const maskId = `mask-edge-${idx}`;
    const color = edge.style.stroke;
    addArrowDef(defs, arrowId, color);

    const { path, labelPos, arrowAngle } = routeEdge(from, to, edge.style.curved);

    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", "gn-edge");
    g.setAttribute("data-from", edge.from);
    g.setAttribute("data-to", edge.to);

    const pathEl = document.createElementNS(NS, "path");
    pathEl.setAttribute("d", path);
    pathEl.setAttribute("fill", "none");
    pathEl.setAttribute("stroke", color);
    pathEl.setAttribute("stroke-width", String(edge.style.bold ? edge.style.strokeWidth * 2 : edge.style.strokeWidth));
    if (edge.style.dashed) pathEl.setAttribute("stroke-dasharray", "8,4");
    if (edge.style.dotted) pathEl.setAttribute("stroke-dasharray", "2,4");
    pathEl.setAttribute("marker-end", `url(#${arrowId})`);

    // Create mask and label text if it has a label
    if (edge.label) {
        const fs = edge.style.fontSize;
        const bw = edge.label.length * fs * 0.6 + 8;
        const bh = fs + 4;
        const lx = labelPos.x;
        const ly = labelPos.y;

        const mask = document.createElementNS(NS, "mask");
        mask.setAttribute("id", maskId);
        mask.setAttribute("maskUnits", "userSpaceOnUse");

        const mWhite = document.createElementNS(NS, "rect");
        mWhite.setAttribute("x", "-100000");
        mWhite.setAttribute("y", "-100000");
        mWhite.setAttribute("width", "200000");
        mWhite.setAttribute("height", "200000");
        mWhite.setAttribute("fill", "white");
        mask.appendChild(mWhite);

        const mBlack = document.createElementNS(NS, "rect");
        mBlack.setAttribute("x", String(lx - bw / 2));
        mBlack.setAttribute("y", String(ly - bh / 2));
        mBlack.setAttribute("width", String(bw));
        mBlack.setAttribute("height", String(bh));
        mBlack.setAttribute("fill", "black");
        mBlack.setAttribute("rx", "2");
        mask.appendChild(mBlack);

        defs.appendChild(mask);
        pathEl.setAttribute("mask", `url(#${maskId})`);
    }

    g.appendChild(pathEl);

    // Hit-area (wider invisible path for click targeting)
    const hitPath = document.createElementNS(NS, "path");
    hitPath.setAttribute("d", path);
    hitPath.setAttribute("fill", "none");
    hitPath.setAttribute("stroke", "transparent");
    hitPath.setAttribute("stroke-width", "14");
    hitPath.style.cursor = "pointer";
    g.appendChild(hitPath);

    if (edge.label) {
        const textEl = document.createElementNS(NS, "text");
        textEl.setAttribute("text-anchor", "middle");
        textEl.setAttribute("dominant-baseline", "central");
        textEl.setAttribute("x", String(labelPos.x));
        textEl.setAttribute("y", String(labelPos.y));
        textEl.setAttribute("fill", edge.style.fontColor);
        textEl.setAttribute("font-family", edge.style.fontFamily);
        textEl.setAttribute("font-size", String(edge.style.fontSize));
        textEl.textContent = edge.label;
        textEl.style.pointerEvents = "none";
        g.appendChild(textEl);
    }

    parent.appendChild(g);
}

function renderCluster(parent: Element, cluster: GnCluster, graph: GnGraph) {
    computeClusterBounds(cluster, graph);
    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", "gn-cluster");
    g.setAttribute("data-id", cluster.id);

    const rect = document.createElementNS(NS, "rect");
    rect.setAttribute("x", String(cluster.x - cluster.width / 2));
    rect.setAttribute("y", String(cluster.y - cluster.height / 2));
    rect.setAttribute("width", String(cluster.width));
    rect.setAttribute("height", String(cluster.height));
    const s = cluster.style;
    rect.setAttribute("fill", s.filled ? s.fill : "rgba(255,255,255,0.03)");
    rect.setAttribute("stroke", s.stroke || "#666");
    rect.setAttribute("stroke-width", String(s.strokeWidth));
    rect.setAttribute("rx", s.rounded ? "8" : "4");
    if (s.dashed) rect.setAttribute("stroke-dasharray", "6,3");
    g.appendChild(rect);

    if (cluster.label) {
        const text = document.createElementNS(NS, "text");
        text.setAttribute("x", String(cluster.x));
        text.setAttribute("y", String(cluster.y - cluster.height / 2 + 14));
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("fill", s.fontColor || "#888");
        text.setAttribute("font-family", s.fontFamily);
        text.setAttribute("font-size", String(s.fontSize || 12));
        text.setAttribute("font-weight", "600");
        text.textContent = cluster.label;
        text.style.pointerEvents = "none";
        g.appendChild(text);
    }

    parent.appendChild(g);
}

function computeClusterBounds(cluster: GnCluster, graph: GnGraph) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const pad = 30;
    const topPad = cluster.label ? 28 : pad;

    cluster.children.forEach((id) => {
        const n = graph.nodes.get(id);
        if (!n) return;
        minX = Math.min(minX, n.x - n.width / 2);
        minY = Math.min(minY, n.y - n.height / 2);
        maxX = Math.max(maxX, n.x + n.width / 2);
        maxY = Math.max(maxY, n.y + n.height / 2);
    });

    cluster.subclusters.forEach((sid) => {
        const sc = graph.clusters.get(sid);
        if (!sc) return;
        computeClusterBounds(sc, graph);
        minX = Math.min(minX, sc.x - sc.width / 2);
        minY = Math.min(minY, sc.y - sc.height / 2);
        maxX = Math.max(maxX, sc.x + sc.width / 2);
        maxY = Math.max(maxY, sc.y + sc.height / 2);
    });

    if (minX === Infinity) { minX = 0; minY = 0; maxX = 100; maxY = 60; }

    cluster.x = (minX + maxX) / 2;
    cluster.y = (minY + maxY) / 2 + (topPad - pad) / 2;
    cluster.width = (maxX - minX) + pad * 2;
    cluster.height = (maxY - minY) + topPad + pad;
}

function measureNode(node: GnNode) {
    if (node.width && node.height) return;
    const lines = node.label.split("\n");
    const maxLen = Math.max(...lines.map((l) => l.length));
    node.width = Math.max(maxLen * node.style.fontSize * 0.6 + NODE_PAD_X * 2, 60);
    node.height = Math.max(lines.length * (node.style.fontSize + 2) + NODE_PAD_Y * 2, 36);

    if (["diamond", "Mdiamond"].includes(node.shape)) {
        node.width *= 1.4;
        node.height *= 1.4;
    } else if (["circle", "doublecircle"].includes(node.shape)) {
        const r = Math.max(node.width, node.height);
        node.width = r;
        node.height = r;
    }
}

function addArrowDef(defs: Element, id: string, color: string) {
    if (defs.querySelector(`#${id}`)) return;
    const marker = document.createElementNS(NS, "marker");
    marker.setAttribute("id", id);
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "9");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", String(ARROW_SIZE));
    marker.setAttribute("markerHeight", String(ARROW_SIZE));
    marker.setAttribute("orient", "auto-start-reverse");
    const arrow = document.createElementNS(NS, "path");
    arrow.setAttribute("d", "M0,1 L10,5 L0,9 Z");
    arrow.setAttribute("fill", color);
    marker.appendChild(arrow);
    defs.appendChild(marker);
}

function addGlowFilter(defs: Element) {
    const f = document.createElementNS(NS, "filter");
    f.setAttribute("id", "glow");
    const blur = document.createElementNS(NS, "feGaussianBlur");
    blur.setAttribute("stdDeviation", "3");
    blur.setAttribute("result", "blur");
    f.appendChild(blur);
    const flood = document.createElementNS(NS, "feFlood");
    flood.setAttribute("flood-color", "#6c5ce7");
    flood.setAttribute("flood-opacity", "0.5");
    flood.setAttribute("result", "c");
    f.appendChild(flood);
    const comp = document.createElementNS(NS, "feComposite");
    comp.setAttribute("in", "c"); comp.setAttribute("in2", "blur"); comp.setAttribute("operator", "in"); comp.setAttribute("result", "s");
    f.appendChild(comp);
    const merge = document.createElementNS(NS, "feMerge");
    const n1 = document.createElementNS(NS, "feMergeNode"); n1.setAttribute("in", "s"); merge.appendChild(n1);
    const n2 = document.createElementNS(NS, "feMergeNode"); n2.setAttribute("in", "SourceGraphic"); merge.appendChild(n2);
    f.appendChild(merge);
    defs.appendChild(f);
}
