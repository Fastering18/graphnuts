import type { GnNode, GnShape } from "./types";

interface Point { x: number; y: number; }

export function routeEdge(
    from: GnNode, to: GnNode, curved: boolean
): { path: string; labelPos: Point; arrowAngle: number } {
    const fx = from.x, fy = from.y, tx = to.x, ty = to.y;
    const pFrom = borderPoint(from, tx, ty);
    const pTo = borderPoint(to, fx, fy);

    let path: string;
    let labelPos: Point;
    let arrowAngle: number;

    if (curved) {
        const mid = midpoint(pFrom, pTo);
        const dx = pTo.x - pFrom.x;
        const dy = pTo.y - pFrom.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const off = Math.min(len * 0.15, 30);
        const nx = -dy / len * off;
        const ny = dx / len * off;
        const cp = { x: mid.x + nx, y: mid.y + ny };
        path = `M${pFrom.x},${pFrom.y} Q${cp.x},${cp.y} ${pTo.x},${pTo.y}`;
        labelPos = quadBezierAt(pFrom, cp, pTo, 0.5);
        const tangent = quadBezierTangent(pFrom, cp, pTo, 1);
        arrowAngle = Math.atan2(tangent.y, tangent.x);
    } else {
        path = `M${pFrom.x},${pFrom.y} L${pTo.x},${pTo.y}`;
        labelPos = midpoint(pFrom, pTo);
        arrowAngle = Math.atan2(pTo.y - pFrom.y, pTo.x - pFrom.x);
    }

    return { path, labelPos, arrowAngle };
}

export function borderPoint(node: GnNode, targetX: number, targetY: number): Point {
    const dx = targetX - node.x;
    const dy = targetY - node.y;
    const w = (node.width || 80) / 2;
    const h = (node.height || 40) / 2;

    if (dx === 0 && dy === 0) return { x: node.x + w, y: node.y };

    const shape = normalizeShape(node.shape);

    switch (shape) {
        case "ellipse":
        case "circle":
        case "doublecircle":
            return ellipseBorder(node.x, node.y, w, h, dx, dy);

        case "diamond":
        case "Mdiamond":
            return diamondBorder(node.x, node.y, w, h, dx, dy);

        default: // box, rect, rectangle, record, etc.
            return rectBorder(node.x, node.y, w, h, dx, dy);
    }
}

function rectBorder(cx: number, cy: number, hw: number, hh: number, dx: number, dy: number): Point {
    const absDx = Math.abs(dx), absDy = Math.abs(dy);
    let scale: number;
    if (absDx * hh > absDy * hw) {
        scale = hw / absDx;
    } else {
        scale = hh / absDy;
    }
    return { x: cx + dx * scale, y: cy + dy * scale };
}

function ellipseBorder(cx: number, cy: number, rx: number, ry: number, dx: number, dy: number): Point {
    const angle = Math.atan2(dy * rx, dx * ry);
    return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
}

function diamondBorder(cx: number, cy: number, hw: number, hh: number, dx: number, dy: number): Point {
    const absDx = Math.abs(dx), absDy = Math.abs(dy);
    const sx = dx >= 0 ? 1 : -1;
    const sy = dy >= 0 ? 1 : -1;

    if (absDx * hh + absDy * hw === 0) return { x: cx + hw, y: cy };
    const t = (hw * hh) / (absDx * hh + absDy * hw);
    return { x: cx + dx * t, y: cy + dy * t };
}

function midpoint(a: Point, b: Point): Point {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function quadBezierAt(a: Point, cp: Point, b: Point, t: number): Point {
    const mt = 1 - t;
    return {
        x: mt * mt * a.x + 2 * mt * t * cp.x + t * t * b.x,
        y: mt * mt * a.y + 2 * mt * t * cp.y + t * t * b.y,
    };
}

function quadBezierTangent(a: Point, cp: Point, b: Point, t: number): Point {
    const mt = 1 - t;
    return {
        x: 2 * mt * (cp.x - a.x) + 2 * t * (b.x - cp.x),
        y: 2 * mt * (cp.y - a.y) + 2 * t * (b.y - cp.y),
    };
}

function normalizeShape(shape: GnShape): string {
    const map: Record<string, string> = {
        rect: "box", rectangle: "box", square: "box",
        oval: "ellipse", circle: "ellipse",
        Mrecord: "box", record: "box",
        plaintext: "box", plain: "box", none: "box",
        Mdiamond: "diamond",
        doublecircle: "ellipse",
    };
    return map[shape] || shape;
}
