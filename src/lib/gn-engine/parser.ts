import {
    type GnGraph, type GnNode, type GnEdge, type GnCluster, type GnShape,
    createEmptyGraph, parseStyle, parseEdgeStyle, DEFAULT_STYLE,
} from "./types";

// ── Tokenizer ────────────────────────────────────
type TType = "id" | "str" | "html" | "{" | "}" | "[" | "]" | "=" | ";" | "," | ":" | "->" | "--" | "eof";
interface Token { type: TType; value: string; }

function tokenize(src: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    const n = src.length;

    while (i < n) {
        if (/\s/.test(src[i])) { i++; continue; }
        if (src[i] === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
        if (src[i] === "/" && src[i + 1] === "*") { i += 2; while (i < n - 1 && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
        if (src[i] === "-" && src[i + 1] === ">") { tokens.push({ type: "->", value: "->" }); i += 2; continue; }
        if (src[i] === "-" && src[i + 1] === "-") { tokens.push({ type: "--", value: "--" }); i += 2; continue; }

        const single: Record<string, TType> = { "{": "{", "}": "}", "[": "[", "]": "]", "=": "=", ";": ";", ",": ",", ":": ":" };
        if (single[src[i]]) { tokens.push({ type: single[src[i]], value: src[i] }); i++; continue; }

        if (src[i] === "<" && (i === 0 || /[=\s]/.test(src[i - 1]))) {
            let depth = 1, start = i;
            i++;
            while (i < n && depth > 0) { if (src[i] === "<") depth++; if (src[i] === ">") depth--; i++; }
            tokens.push({ type: "html", value: src.slice(start + 1, i - 1) });
            continue;
        }

        if (src[i] === '"') {
            let s = "";
            i++;
            while (i < n && src[i] !== '"') {
                if (src[i] === "\\" && i + 1 < n) {
                    const esc = src[i + 1];
                    if (esc === "n") s += "\n";
                    else if (esc === "r") s += "\r";
                    else if (esc === "t") s += "\t";
                    else if (esc === "\\") s += "\\";
                    else if (esc === '"') s += '"';
                    else s += esc; // Fallback for other escapes like \l or just unexpected ones
                    i += 2;
                }
                else { s += src[i]; i++; }
            }
            i++;
            tokens.push({ type: "str", value: s });
            continue;
        }

        if (/[A-Za-z0-9_.]/.test(src[i]) || src[i] === "#" || src[i] === "&") {
            let s = "";
            while (i < n && /[A-Za-z0-9_.#&]/.test(src[i])) { s += src[i]; i++; }
            tokens.push({ type: "id", value: s });
            continue;
        }

        i++;
    }

    tokens.push({ type: "eof", value: "" });
    return tokens;
}

// ── Parser ───────────────────────────────────────
class Parser {
    tokens: Token[];
    pos = 0;
    graph: GnGraph;

    constructor(tokens: Token[]) { this.tokens = tokens; this.graph = createEmptyGraph(); }

    peek(): Token { return this.tokens[this.pos] || { type: "eof", value: "" }; }
    next(): Token { return this.tokens[this.pos++] || { type: "eof", value: "" }; }
    expect(t: TType): Token { const tok = this.next(); if (tok.type !== t) throw new Error(`Expected ${t} got ${tok.type}:${tok.value}`); return tok; }
    match(t: TType): boolean { if (this.peek().type === t) { this.next(); return true; } return false; }
    isId(): boolean { const t = this.peek().type; return t === "id" || t === "str"; }

    readId(): string {
        const t = this.next();
        if (t.type === "id" || t.type === "str" || t.type === "html") return t.value;
        throw new Error(`Expected id got ${t.type}`);
    }

    readNodeId(): string {
        const id = this.readId();
        // Consume optional port :port or :port:compass
        while (this.peek().type === ":") {
            this.next();
            if (this.isId()) this.readId();
        }
        return id;
    }

    parse(): GnGraph {
        const t = this.peek();
        if (t.value === "strict") this.next();
        if (this.peek().value === "digraph") { this.next(); this.graph.directed = true; }
        else if (this.peek().value === "graph") { this.next(); this.graph.directed = false; }
        if (this.isId()) this.readId();
        this.expect("{");
        this.parseBody(null);
        this.match("}");

        if (this.graph.attrs.bgcolor) {
            this.graph.bgcolor = this.graph.attrs.bgcolor;
        }

        return this.graph;
    }

    parseBody(clusterId: string | null) {
        while (this.peek().type !== "}" && this.peek().type !== "eof") {
            this.parseStatement(clusterId);
            this.match(";");
        }
    }

    parseStatement(clusterId: string | null) {
        const p = this.peek();

        // Subgraph (named or anonymous)
        if (p.value === "subgraph") {
            this.next();
            const id = this.isId() ? this.readId() : `_anon_${Math.random().toString(36).slice(2, 6)}`;
            if (this.peek().type === "{") {
                this.expect("{");
                const cluster: GnCluster = {
                    id, label: id.replace(/^cluster_?/i, ""), children: [], subclusters: [],
                    style: { ...DEFAULT_STYLE }, x: 0, y: 0, width: 0, height: 0, attrs: {},
                };
                this.graph.clusters.set(id, cluster);
                if (clusterId) { const parent = this.graph.clusters.get(clusterId); if (parent) parent.subclusters.push(id); }
                this.parseBody(id);
                this.expect("}");
                cluster.style = parseStyle(cluster.attrs);
            }
            return;
        }

        // Anonymous subgraph { ... } (used by rank=same etc.)
        if (p.type === "{") {
            this.next();
            // Parse rank=same or other content, but don't create a cluster
            while (this.peek().type !== "}" && this.peek().type !== "eof") {
                this.parseStatement(clusterId);
                this.match(";");
            }
            this.match("}");
            return;
        }

        // graph/node/edge defaults
        if ((p.value === "graph" || p.value === "node" || p.value === "edge") && this.tokens[this.pos + 1]?.type === "[") {
            const kind = this.next().value;
            const attrs = this.parseAttrs();
            if (kind === "graph") Object.assign(this.graph.attrs, attrs);
            else if (kind === "node") Object.assign(this.graph.nodeDefaults, attrs);
            else if (kind === "edge") Object.assign(this.graph.edgeDefaults, attrs);
            if (kind === "graph" && clusterId) {
                const c = this.graph.clusters.get(clusterId);
                if (c) Object.assign(c.attrs, attrs);
            }
            return;
        }

        // Attr assignment: key = value (rank=same, label=..., etc.)
        if (this.isId() && this.tokens[this.pos + 1]?.type === "=") {
            const key = this.readId();
            this.next(); // =
            const val = this.peek().type === "html" ? this.next().value : this.readId();
            if (clusterId) {
                const c = this.graph.clusters.get(clusterId);
                if (c) {
                    c.attrs[key] = val;
                    if (key === "label") c.label = this.extractLabel(c.attrs, c.label);
                }
            } else {
                this.graph.attrs[key] = val;
            }
            return;
        }

        // Node or edge chain
        if (this.isId()) {
            const ids: string[] = [this.readNodeId()];
            const arrow = this.graph.directed ? "->" : "--";
            while (this.peek().type === arrow) {
                this.next();
                ids.push(this.readNodeId());
            }
            const attrs = this.peek().type === "[" ? this.parseAttrs() : {};

            if (ids.length === 1) {
                this.ensureNode(ids[0], attrs, clusterId);
            } else {
                for (let i = 0; i < ids.length - 1; i++) {
                    this.ensureNode(ids[i], {}, clusterId);
                    this.ensureNode(ids[i + 1], {}, clusterId);
                    const edge: GnEdge = {
                        from: ids[i], to: ids[i + 1],
                        label: this.extractLabel(attrs, ""),
                        style: parseEdgeStyle(attrs, this.edgeDefaultStyle()),
                        attrs,
                    };
                    this.graph.edges.push(edge);
                }
            }
        }
    }

    ensureNode(id: string, attrs: Record<string, string>, clusterId: string | null) {
        let node = this.graph.nodes.get(id);
        if (!node) {
            const merged = { ...this.graph.nodeDefaults, ...attrs };
            node = {
                id,
                label: this.extractLabel(merged, id),
                shape: (merged.shape || "box") as GnShape,
                x: 0, y: 0,
                width: parseFloat(merged.width || "0") * 72 || 0,
                height: parseFloat(merged.height || "0") * 72 || 0,
                style: parseStyle(merged),
                cluster: clusterId || undefined,
                attrs: merged,
            };
            this.applyPosition(node);
            this.graph.nodes.set(id, node);
        } else {
            if (Object.keys(attrs).length > 0) {
                Object.assign(node.attrs, attrs);
                node.label = this.extractLabel(node.attrs, id);
                node.shape = (node.attrs.shape || node.shape) as GnShape;
                node.style = parseStyle(node.attrs);
                this.applyPosition(node);
            }
            if (clusterId && !node.cluster) node.cluster = clusterId;
        }
        if (clusterId) {
            const c = this.graph.clusters.get(clusterId);
            if (c && !c.children.includes(id)) c.children.push(id);
        }
    }

    applyPosition(node: GnNode) {
        let p = node.attrs.pos || node.attrs.position;
        if (p) {
            p = p.replace(/"/g, "");
            if (p.endsWith("!")) p = p.slice(0, -1);
            const coords = p.split(",");
            if (coords.length === 2) {
                node.x = parseFloat(coords[0]);
                node.y = parseFloat(coords[1]);
            }
        }
    }

    extractLabel(attrs: Record<string, string>, fallback: string): string {
        const raw = attrs.label;
        if (raw === undefined || raw === null) return fallback;
        // If it starts with < and ends with >, it's an HTML label - strip tags
        if (raw.trim().startsWith("<") && raw.trim().endsWith(">")) {
            return raw.replace(/<[^>]+>/g, "").trim() || fallback;
        }
        // Otherwise it's a plain string label, we already handled escapes in tokenizer
        return raw || fallback;
    }

    edgeDefaultStyle(): Partial<import("./types").GnEdgeStyle> {
        const d = this.graph.edgeDefaults;
        const result: Record<string, unknown> = {};
        if (d.color) result.stroke = d.color;
        if (d.penwidth) result.strokeWidth = parseFloat(d.penwidth);
        if (d.fontname) result.fontFamily = d.fontname;
        if (d.fontsize) result.fontSize = parseFloat(d.fontsize);
        if (d.fontcolor) result.fontColor = d.fontcolor;
        if (d.style) {
            const parts = d.style.split(",").map((s) => s.trim());
            if (parts.includes("dashed")) result.dashed = true;
            if (parts.includes("dotted")) result.dotted = true;
            if (parts.includes("bold")) result.bold = true;
        }
        return result as Partial<import("./types").GnEdgeStyle>;
    }

    parseAttrs(): Record<string, string> {
        const attrs: Record<string, string> = {};
        this.expect("[");
        while (this.peek().type !== "]" && this.peek().type !== "eof") {
            if (this.peek().type === "," || this.peek().type === ";") { this.next(); continue; }
            const key = this.readId();
            if (this.match("=")) {
                if (this.peek().type === "html") {
                    attrs[key] = this.next().value;
                } else {
                    attrs[key] = this.readId();
                }
            } else {
                attrs[key] = "true";
            }
        }
        this.expect("]");
        return attrs;
    }
}

export function parseDot(src: string): GnGraph {
    const tokens = tokenize(src);
    const parser = new Parser(tokens);
    try {
        return parser.parse();
    } catch {
        return createEmptyGraph();
    }
}
