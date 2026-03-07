import { removeAllPositions } from "./dot-patcher";

export type LayoutMode = "dot" | "grid" | "circular" | "snowflake" | "force";

export function applyLayout(dot: string, mode: LayoutMode, nodeIds: string[]): string {
    const clean = removeAllPositions(dot);
    switch (mode) {
        case "grid": return applyGridPositions(clean, nodeIds);
        case "circular": return applyCircularPositions(clean, nodeIds);
        default: return clean;
    }
}

function applyGridPositions(dot: string, nodeIds: string[]): string {
    const cols = Math.ceil(Math.sqrt(nodeIds.length));
    const spacing = 200;
    let result = dot;
    nodeIds.forEach((id, i) => {
        const x = (i % cols) * spacing;
        const y = Math.floor(i / cols) * spacing;
        result = insertPos(result, id, x, y);
    });
    return result;
}

function applyCircularPositions(dot: string, nodeIds: string[]): string {
    const n = nodeIds.length;
    const radius = Math.max(200, n * 40);
    let result = dot;
    nodeIds.forEach((id, i) => {
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;
        result = insertPos(result, id, Math.round(radius * Math.cos(angle)), Math.round(radius * Math.sin(angle)));
    });
    return result;
}

function insertPos(dot: string, nodeId: string, x: number, y: number): string {
    const esc = nodeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const posVal = `"${x},${y}!"`;
    const re = new RegExp(`(^[ \\t]*${esc}\\s*\\[)([^\\]]*)(\\])`, "m");
    const m = dot.match(re);
    if (m) {
        const posPattern = /pos\s*=\s*"[^"]*"/;
        const updated = posPattern.test(m[2]) ? m[2].replace(posPattern, `pos=${posVal}`) : `pos=${posVal} ${m[2]}`;
        return dot.replace(re, `$1${updated}$3`);
    }
    return dot;
}

export const LAYOUT_OPTIONS: { value: LayoutMode; label: string; icon: string }[] = [
    { value: "dot", label: "Tree (Hierarchical)", icon: "🌳" },
    { value: "grid", label: "Grid", icon: "▦" },
    { value: "circular", label: "Circular", icon: "◎" },
];
