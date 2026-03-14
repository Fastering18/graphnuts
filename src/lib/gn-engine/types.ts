export interface GnNode {
    id: string;
    label: string;
    shape: GnShape;
    x: number;
    y: number;
    width: number;
    height: number;
    style: GnStyle;
    cluster?: string;
    attrs: Record<string, string>;
}

export interface GnEdge {
    from: string;
    to: string;
    label: string;
    style: GnEdgeStyle;
    points?: { x: number; y: number }[];
    attrs: Record<string, string>;
}

export interface GnCluster {
    id: string;
    label: string;
    children: string[];
    subclusters: string[];
    style: GnStyle;
    x: number;
    y: number;
    width: number;
    height: number;
    attrs: Record<string, string>;
}

export interface GnGraph {
    directed: boolean;
    nodes: Map<string, GnNode>;
    edges: GnEdge[];
    clusters: Map<string, GnCluster>;
    attrs: Record<string, string>;
    bgcolor?: string;
    nodeDefaults: Record<string, string>;
    edgeDefaults: Record<string, string>;
}

export type GnShape =
    | "box" | "rect" | "rectangle" | "square"
    | "ellipse" | "circle" | "oval"
    | "diamond" | "Mdiamond"
    | "hexagon" | "octagon"
    | "house" | "invhouse"
    | "triangle" | "invtriangle"
    | "parallelogram"
    | "cylinder"
    | "note"
    | "tab"
    | "folder"
    | "component"
    | "doublecircle" | "doubleoctagon"
    | "plaintext" | "plain" | "none"
    | "record" | "Mrecord"
    | "star"
    | "underline"
    | "cds";

export interface GnStyle {
    fill: string;
    stroke: string;
    strokeWidth: number;
    fontFamily: string;
    fontSize: number;
    fontColor: string;
    rounded: boolean;
    dashed: boolean;
    dotted: boolean;
    bold: boolean;
    filled: boolean;
}

export interface GnEdgeStyle {
    stroke: string;
    strokeWidth: number;
    fontFamily: string;
    fontSize: number;
    fontColor: string;
    dashed: boolean;
    dotted: boolean;
    bold: boolean;
    curved: boolean;
    arrowHead: string;
    arrowTail: string;
}

export const DEFAULT_STYLE: GnStyle = {
    fill: "#ffffff",
    stroke: "#333333",
    strokeWidth: 1,
    fontFamily: "Segoe UI, Arial, sans-serif",
    fontSize: 14,
    fontColor: "#333333",
    rounded: false,
    dashed: false,
    dotted: false,
    bold: false,
    filled: false,
};

export const DEFAULT_EDGE_STYLE: GnEdgeStyle = {
    stroke: "#333333",
    strokeWidth: 1.2,
    fontFamily: "Segoe UI, Arial, sans-serif",
    fontSize: 12,
    fontColor: "#333333",
    dashed: false,
    dotted: false,
    bold: false,
    curved: true,
    arrowHead: "normal",
    arrowTail: "none",
};

export function createEmptyGraph(): GnGraph {
    return {
        directed: true,
        nodes: new Map(),
        edges: [],
        clusters: new Map(),
        attrs: {},
        nodeDefaults: {},
        edgeDefaults: {},
    };
}

export function parseStyle(attrs: Record<string, string>, defaults: Partial<GnStyle> = {}): GnStyle {
    const s = { ...DEFAULT_STYLE, ...defaults };
    const styleStr = attrs.style || "";
    const parts = styleStr.split(",").map((p) => p.trim().toLowerCase());

    if (parts.includes("filled")) { s.filled = true; }
    if (parts.includes("rounded")) { s.rounded = true; }
    if (parts.includes("dashed")) { s.dashed = true; }
    if (parts.includes("dotted")) { s.dotted = true; }
    if (parts.includes("bold")) { s.bold = true; }

    if (attrs.fillcolor) s.fill = attrs.fillcolor;
    else if (s.filled && attrs.color) s.fill = attrs.color;
    if (attrs.color) s.stroke = attrs.color;
    if (attrs.penwidth) s.strokeWidth = parseFloat(attrs.penwidth) || 1;
    if (attrs.fontname) s.fontFamily = attrs.fontname;
    if (attrs.fontsize) s.fontSize = parseFloat(attrs.fontsize) || 14;
    if (attrs.fontcolor) s.fontColor = attrs.fontcolor;

    return s;
}

export function parseEdgeStyle(attrs: Record<string, string>, defaults: Partial<GnEdgeStyle> = {}): GnEdgeStyle {
    const s = { ...DEFAULT_EDGE_STYLE, ...defaults };
    const styleStr = attrs.style || "";
    const parts = styleStr.split(",").map((p) => p.trim().toLowerCase());

    if (parts.includes("dashed")) { s.dashed = true; s.dotted = false; }
    if (parts.includes("dotted")) { s.dotted = true; s.dashed = false; }
    if (parts.includes("bold")) { s.bold = true; }
    if (parts.includes("invis")) { s.stroke = "transparent"; }

    if (attrs.color) s.stroke = attrs.color;
    if (attrs.penwidth) s.strokeWidth = parseFloat(attrs.penwidth) || 1.2;
    if (attrs.fontname) s.fontFamily = attrs.fontname;
    if (attrs.fontsize) s.fontSize = parseFloat(attrs.fontsize) || 12;
    if (attrs.fontcolor) s.fontColor = attrs.fontcolor;
    if (attrs.arrowhead) s.arrowHead = attrs.arrowhead;
    if (attrs.arrowtail) s.arrowTail = attrs.arrowtail;

    return s;
}
