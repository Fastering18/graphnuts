export function patchNodePosition(dot: string, nodeId: string, x: number, y: number): string {
    const esc = escapeRegex(nodeId);
    const posVal = `"${Math.round(x)},${Math.round(y)}!"`;
    const nodeWithAttrs = new RegExp(`(^[ \\t]*${esc}\\s*\\[)([^\\]]*)(\\])`, "m");
    const match = dot.match(nodeWithAttrs);
    if (match) {
        const attrs = match[2];
        const posPattern = /pos\s*=\s*"[^"]*"!?/;
        const updated = posPattern.test(attrs)
            ? attrs.replace(posPattern, `pos=${posVal}`)
            : `pos=${posVal} ${attrs}`;
        return dot.replace(nodeWithAttrs, `$1${updated}$3`);
    }
    const nodePlain = new RegExp(`(^[ \\t]*)(${esc})\\s*$`, "m");
    if (dot.match(nodePlain)) return dot.replace(nodePlain, `$1$2 [pos=${posVal}]`);
    return dot;
}

export function patchAllPositions(dot: string, positions: Map<string, { x: number; y: number }>): string {
    let result = dot;
    positions.forEach(({ x, y }, id) => { result = patchNodePosition(result, id, x, y); });
    return result;
}

export function removeAllPositions(dot: string): string {
    return dot.replace(/\s*pos\s*=\s*"[^"]*"!?\s*/g, " ");
}

export function deleteNodesFromDot(dot: string, nodeIds: string[]): string {
    let r = dot;
    for (const id of nodeIds) {
        const e = escapeRegex(id);
        r = r.replace(new RegExp(`^[ \\t]*${e}\\s*\\[[^\\]]*\\]\\s*;?\\s*$`, "gm"), "");
        r = r.replace(new RegExp(`^[ \\t]*${e}\\s*$`, "gm"), "");
        r = r.replace(new RegExp(`^[ \\t]*\\S*\\s*->\\s*${e}(\\s|\\[|$).*$`, "gm"), "");
        r = r.replace(new RegExp(`^[ \\t]*${e}\\s*->\\s*\\S+.*$`, "gm"), "");
    }
    return r.replace(/\n{3,}/g, "\n\n");
}

export function renameNodeInDot(dot: string, oldId: string, newId: string): string {
    const e = escapeRegex(oldId);
    let r = dot;
    r = r.replace(new RegExp(`(^[ \\t]*)${e}(\\s*\\[)`, "gm"), `$1${newId}$2`);
    r = r.replace(new RegExp(`(^[ \\t]*)${e}(\\s*$)`, "gm"), `$1${newId}$2`);
    r = r.replace(new RegExp(`(->\\s*)${e}(\\s)`, "gm"), `$1${newId}$2`);
    r = r.replace(new RegExp(`(->\\s*)${e}(\\s*\\[)`, "gm"), `$1${newId}$2`);
    r = r.replace(new RegExp(`(^[ \\t]*)${e}(\\s*->)`, "gm"), `$1${newId}$2`);
    return r;
}

export function patchEdgeStyle(dot: string, from: string, to: string, style: string): string {
    const ef = escapeRegex(from), et = escapeRegex(to);
    const re = new RegExp(`(^[ \\t]*"?(?:${ef})"?[ \\t]*->[ \\t]*"?(?:${et})"?\\s*\\[)([^\\]]*)(\\])`, "m");
    const m = dot.match(re);
    if (m) {
        const attrs = m[2];
        const sp = /style\s*=\s*\w+/;
        const updated = sp.test(attrs) ? attrs.replace(sp, `style=${style}`) : `style=${style} ${attrs}`;
        return dot.replace(re, `$1${updated}$3`);
    }
    const re2 = new RegExp(`(^[ \\t]*"?(?:${ef})"?[ \\t]*->[ \\t]*"?(?:${et})"?)[ \\t]*$`, "m");
    if (dot.match(re2)) return dot.replace(re2, `$1 [style=${style}]`);
    return dot;
}

export function findNodeLine(dot: string, nodeId: string): number {
    const lines = dot.split(/\r?\n/);
    const esc = escapeRegex(nodeId);
    const re = new RegExp(`^[ \\t]*${esc}(\\s|\\[|$)`);
    for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i]) && !lines[i].includes("->")) return i + 1;
    }
    const reEdge = new RegExp(`${esc}\\s*->`);
    for (let i = 0; i < lines.length; i++) {
        if (reEdge.test(lines[i])) return i + 1;
    }
    const reSub = new RegExp(`subgraph\\s+${esc}`);
    for (let i = 0; i < lines.length; i++) {
        if (reSub.test(lines[i])) return i + 1;
    }
    return 1;
}

export function getClusterChildIds(dot: string, clusterId: string): string[] {
    const ids: string[] = [];
    const esc = escapeRegex(clusterId);
    const re = new RegExp(`subgraph\\s+${esc}\\s*\\{`, "m");
    const m = dot.match(re);
    if (!m || m.index === undefined) return ids;
    let depth = 0;
    let start = dot.indexOf("{", m.index);
    for (let i = start; i < dot.length; i++) {
        if (dot[i] === "{") depth++;
        else if (dot[i] === "}") { depth--; if (depth === 0) break; }
        if (depth > 0) {
            const rest = dot.slice(i).match(/^([A-Za-z_]\w*)\s*(?:\[|$)/m);
            if (rest && rest.index === 0 && !["graph", "node", "edge", "subgraph", "digraph", "strict", "label", "style", "color", "fillcolor",
                "fontname", "fontsize", "fontcolor", "penwidth", "margin", "rankdir", "bgcolor", "compound", "pad", "nodesep", "ranksep", "size",
                "rank"].includes(rest[1])) {
                ids.push(rest[1]);
            }
        }
    }
    return ids;
}

export function extractSvgPositions(svgEl: SVGSVGElement): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>();
    svgEl.querySelectorAll("g.node").forEach((g) => {
        const title = g.querySelector("title")?.textContent;
        if (!title || title === "%0") return;
        const transform = g.getAttribute("transform") || "";
        const m = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        if (m) {
            positions.set(title, { x: parseFloat(m[1]), y: -parseFloat(m[2]) });
        } else {
            const shapes = g.querySelectorAll("ellipse, polygon, rect");
            if (shapes.length > 0) {
                const bbox = (g as SVGGElement).getBBox();
                positions.set(title, { x: bbox.x + bbox.width / 2, y: -(bbox.y + bbox.height / 2) });
            }
        }
    });
    return positions;
}

export function extractNodeIds(svgString: string): string[] {
    const ids: string[] = [];
    const re = /<title>([^<]+)<\/title>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(svgString))) {
        const id = m[1];
        if (id && !id.startsWith("cluster") && id !== "%0" && !id.includes("->")) ids.push(id);
    }
    return [...new Set(ids)];
}

export interface GraphElement {
    type: "graph" | "cluster" | "node" | "edge";
    id: string;
    label?: string;
    children?: GraphElement[];
}

export function parseDotHierarchy(dot: string): GraphElement[] {
    const lines = dot.split(/\r?\n/);
    const root: GraphElement = { type: "graph", id: "root", label: "Graph", children: [] };
    const stack: GraphElement[] = [root];

    for (const raw of lines) {
        const line = raw.replace(/\/\/.*$/, "").trim();
        if (!line) continue;
        const current = stack[stack.length - 1];

        const subM = line.match(/^subgraph\s+(\w+)\s*\{/);
        if (subM) {
            const el: GraphElement = { type: "cluster", id: subM[1], label: subM[1].replace(/^cluster_?/i, ""), children: [] };
            current.children!.push(el);
            stack.push(el);
            continue;
        }
        if (line === "{" && stack.length > 1) continue;
        if (line.startsWith("}")) { if (stack.length > 1) stack.pop(); continue; }
        if (/^\s*(?:graph|node|edge)\s*\[/.test(line)) continue;
        if (/^\{.*\}/.test(line)) continue;
        if (/^\s*label\s*=/.test(line)) {
            const lm = line.match(/label\s*=\s*(?:"([^"]*)"|<[^>]*>([^<]*)<|(\S+))/);
            if (lm && stack.length > 1) current.label = lm[1] || lm[2] || lm[3] || current.label;
            continue;
        }

        const edgeM = line.match(/^(\S+?)(?::[\w]+)?\s*->\s*(\S+?)(?::[\w]+)?(?:\s*\[|$|\s*;)/);
        if (edgeM) {
            const from = edgeM[1].replace(/"/g, ""), to = edgeM[2].replace(/"/g, "");
            current.children!.push({ type: "edge", id: `${from}->${to}`, label: `${from} → ${to}` });
            continue;
        }

        const nodeM = line.match(/^([A-Za-z_]\w*)\s*(?:\[([^\]]*)\])?/);
        if (nodeM && !["graph", "node", "edge", "subgraph", "digraph", "strict"].includes(nodeM[1])) {
            const attrs = nodeM[2] || "";
            const lm = attrs.match(/label\s*=\s*"([^"]*?)(?:\\n[^"]*)?"/);
            current.children!.push({ type: "node", id: nodeM[1], label: lm ? lm[1] : nodeM[1] });
            continue;
        }
    }

    const clusterLabels = (el: GraphElement) => {
        if (el.type === "cluster" && el.children) {
            const m = dot.match(new RegExp(
                `subgraph\\s+${escapeRegex(el.id)}\\s*\\{[^}]*?label\\s*=\\s*(?:<[^>]*?>\\s*)?(?:<[^>]*?>)?([^<"]+)`, "s"
            ));
            if (m) el.label = m[1].trim().replace(/<\/\w+>/g, "");
            el.children.forEach(clusterLabels);
        }
    };
    root.children!.forEach(clusterLabels);
    return root.children || [];
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
