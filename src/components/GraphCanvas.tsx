"use client";

import { useRef, useEffect, useCallback, useState, useImperativeHandle, forwardRef } from "react";
import { gnRender, gnPositions } from "@/lib/gn-wasm";
import { patchNodePosition } from "@/lib/dot-patcher";
import { select } from "d3-selection";
import { zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";

export type CanvasMode = "pan" | "select";

export interface CanvasHandle {
    getSvg: () => SVGSVGElement | null;
    getLastSvgString: () => string;
    centerView: () => void;
}

interface Props {
    dot: string;
    engine: string;
    mode: CanvasMode;
    onDotChange: (dot: string) => void;
    selection: Set<string>;
    onSelectionChange: (sel: Set<string>) => void;
    onEdgeContext: (edgeId: string, x: number, y: number) => void;
    onNodeShapeContext: (nodeId: string, x: number, y: number) => void;
}

interface NodePos { x: number; y: number; w: number; h: number; }

function shiftEdgePaths(svg: SVGSVGElement, nodeId: string, dx: number, dy: number) {
    svg.querySelectorAll("g.gn-edge").forEach((edgeG) => {
        const ds = edgeG as HTMLElement;
        const from = ds.dataset.from;
        const to = ds.dataset.to;
        if (from !== nodeId && to !== nodeId) return;

        const isFrom = from === nodeId;
        const isTo = to === nodeId;

        edgeG.querySelectorAll("path").forEach(path => {
            const d = path.getAttribute("d") || "";
            const numRegex = /-?\d+(?:\.\d+)?/g;
            const nums: number[] = [];
            let m;
            while ((m = numRegex.exec(d)) !== null) nums.push(parseFloat(m[0]));

            if (nums.length === 4) {
                if (isFrom) { nums[0] += dx; nums[1] += dy; }
                if (isTo) { nums[2] += dx; nums[3] += dy; }
                path.setAttribute("d", `M${nums[0].toFixed(2)},${nums[1].toFixed(2)} L${nums[2].toFixed(2)},${nums[3].toFixed(2)}`);
            } else if (nums.length === 6) {
                if (isFrom) { nums[0] += dx; nums[1] += dy; }
                if (isTo) { nums[4] += dx; nums[5] += dy; }

                const sx = nums[0], sy = nums[1], tx = nums[4], ty = nums[5];
                const mx = (sx + tx) / 2, my = (sy + ty) / 2;
                const xdiff = tx - sx, ydiff = ty - sy;
                let len = Math.sqrt(xdiff * xdiff + ydiff * ydiff);
                if (len < 0.1) len = 1;
                const off = Math.min(len * 0.1, 15.0);
                const nx = -ydiff / len * off, ny = xdiff / len * off;
                nums[2] = mx + nx;
                nums[3] = my + ny;

                path.setAttribute("d", `M${nums[0].toFixed(2)},${nums[1].toFixed(2)} Q${nums[2].toFixed(2)},${nums[3].toFixed(2)} ${nums[4].toFixed(2)},${nums[5].toFixed(2)}`);
            } else if (nums.length >= 8) {
                if (isFrom) { nums[0] += dx; nums[1] += dy; }
                if (isTo) { nums[nums.length - 2] += dx; nums[nums.length - 1] += dy; }
                let newD = `M${nums[0].toFixed(2)},${nums[1].toFixed(2)}`;
                for (let i = 2; i < nums.length; i += 2) {
                    newD += ` L${nums[i].toFixed(2)},${nums[i + 1].toFixed(2)}`;
                }
                path.setAttribute("d", newD);
            }
        });

        // Try to optionally move edge label if it exists
        const text = edgeG.querySelector("text");
        const rect = edgeG.querySelector("rect");
        if (text) {
            const x = parseFloat(text.getAttribute("x") || "0");
            const y = parseFloat(text.getAttribute("y") || "0");
            const tdx = isFrom && isTo ? dx : dx / 2;
            const tdy = isFrom && isTo ? dy : dy / 2;
            text.setAttribute("x", (x + tdx).toFixed(2));
            text.setAttribute("y", (y + tdy).toFixed(2));
            if (rect) {
                const rx = parseFloat(rect.getAttribute("x") || "0");
                const ry = parseFloat(rect.getAttribute("y") || "0");
                rect.setAttribute("x", (rx + tdx).toFixed(2));
                rect.setAttribute("y", (ry + tdy).toFixed(2));
            }
        }
    });
}

const GraphCanvas = forwardRef<CanvasHandle, Props>(function GraphCanvas(
    { dot, engine, mode, onDotChange, selection, onSelectionChange, onEdgeContext, onNodeShapeContext }, ref
) {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement | null>(null);
    const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
    const modeRef = useRef(mode);
    const selRef = useRef(selection);
    const dotRef = useRef(dot);
    const skipRender = useRef(false);
    const positionsRef = useRef<Record<string, NodePos>>({});
    const [error, setError] = useState<string | null>(null);
    const [wasmReady, setWasmReady] = useState(false);
    const dragState = useRef<{ targets: Set<string>; sx: number; sy: number; currentDot: string } | null>(null);

    modeRef.current = mode;
    selRef.current = selection;
    dotRef.current = dot;

    // Warm up WASM
    useEffect(() => { gnRender("digraph{}").then(() => setWasmReady(true)).catch(() => { }); }, []);

    // ── Center view (instant, no animation) ─────
    const centerView = useCallback(() => {
        const svg = svgRef.current;
        if (!svg || !zoomRef.current) return;
        const root = svg.querySelector("g.gn-root") as SVGGElement;
        if (!root) return;
        const bbox = root.getBBox();
        if (bbox.width === 0 || bbox.height === 0) return;
        const c = svg.parentElement!;
        const cw = c.clientWidth, ch = c.clientHeight;
        const scale = Math.min(cw / (bbox.width + 100), ch / (bbox.height + 100), 1.5);
        const tx = cw / 2 - (bbox.x + bbox.width / 2) * scale;
        const ty = ch / 2 - (bbox.y + bbox.height / 2) * scale;
        select(svg).call(zoomRef.current.transform, zoomIdentity.translate(tx, ty).scale(scale));
    }, []);

    useImperativeHandle(ref, () => ({
        getSvg: () => svgRef.current,
        getLastSvgString: () => svgRef.current ? new XMLSerializer().serializeToString(svgRef.current) : "",
        centerView,
    }));

    // ── Selection visuals ───────────────────────
    const applySelection = useCallback((sel: Set<string>) => {
        const svg = svgRef.current;
        if (!svg) return;
        svg.querySelectorAll("g.gn-node").forEach((g) => {
            const id = (g as HTMLElement).dataset.id || "";
            const on = sel.has(id);
            g.classList.toggle("selected", on);
            const shape = g.querySelector("rect,ellipse,polygon,path") as SVGElement | null;
            if (shape) {
                shape.setAttribute("filter", on ? "url(#glow)" : "");
                if (on) shape.setAttribute("stroke-dasharray", "5,3");
                else shape.removeAttribute("stroke-dasharray");
            }
        });
        svg.querySelectorAll("g.gn-edge").forEach((g) => {
            const ds = g as HTMLElement;
            const eid = `${ds.dataset.from}->${ds.dataset.to}`;
            g.classList.toggle("selected", sel.has(eid));
        });
        svg.querySelectorAll("g.gn-cluster").forEach((g) => {
            const id = (g as HTMLElement).dataset.id || "";
            g.classList.toggle("selected", sel.has(id));
        });
    }, []);

    useEffect(() => applySelection(selection), [selection, applySelection]);

    // ── Setup interactions on SVG ───────────────
    const setupInteractions = useCallback((svg: SVGSVGElement) => {
        const svgSel = select(svg);

        const zoomBehavior = zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.05, 10])
            .filter((event) => modeRef.current === "select" ? event.type === "wheel" : true)
            .on("zoom", (event) => {
                const root = svg.querySelector("g.gn-root");
                if (root) (root as SVGGElement).setAttribute("transform", event.transform.toString());
            });
        zoomRef.current = zoomBehavior;
        svgSel.call(zoomBehavior);

        svgSel.on("pointerdown.interact", (event: PointerEvent) => {
            // Only left click or active touch
            if (event.pointerType === "mouse" && event.button !== 0 && event.button !== 2) return;
            const target = event.target as Element;
            const nodeG = target.closest("g.gn-node");
            const edgeG = target.closest("g.gn-edge");
            const clusterG = target.closest("g.gn-cluster");

            // Handle Context Menu Actions (Right Click / Long Press)
            if (event.pointerType === "mouse" && event.button === 2) {
                if (nodeG) {
                    event.preventDefault();
                    event.stopPropagation();
                    const nid = (nodeG as HTMLElement).dataset.id || "";
                    onNodeShapeContext(nid, event.clientX, event.clientY);
                    return;
                }
                if (edgeG) {
                    event.preventDefault();
                    const ds = edgeG as HTMLElement;
                    onEdgeContext(`${ds.dataset.from}->${ds.dataset.to}`, event.clientX, event.clientY);
                    return;
                }
                return;
            }

            if (modeRef.current === "select") {
                if (nodeG || edgeG || clusterG) {
                    event.stopPropagation();
                    let id = "";
                    if (nodeG) id = (nodeG as HTMLElement).dataset.id || "";
                    else if (edgeG) { const ds = edgeG as HTMLElement; id = `${ds.dataset.from}->${ds.dataset.to}`; }
                    else if (clusterG) id = (clusterG as HTMLElement).dataset.id || "";

                    if (event.shiftKey || event.ctrlKey || event.metaKey) {
                        const next = new Set(selRef.current);
                        next.has(id) ? next.delete(id) : next.add(id);
                        onSelectionChange(next);
                    } else {
                        onSelectionChange(new Set([id]));
                    }

                    // Node drag
                    if (nodeG) {
                        event.preventDefault();
                        const nid = (nodeG as HTMLElement).dataset.id || "";
                        let targets: Set<string>;
                        if (selRef.current.has(nid) && selRef.current.size > 0) targets = new Set(selRef.current);
                        else { targets = new Set([nid]); onSelectionChange(targets); }
                        dragState.current = { targets, sx: event.clientX, sy: event.clientY, currentDot: dotRef.current };

                        const onDragMove = (e: PointerEvent) => {
                            if (!dragState.current || !svgRef.current) return;
                            const root = svg.querySelector("g.gn-root");
                            if (!root) return;
                            const ctm = (root as SVGGElement).getScreenCTM();
                            if (!ctm) return;
                            const scale = ctm.a;
                            const dx = (e.clientX - dragState.current.sx) / scale;
                            const dy = (e.clientY - dragState.current.sy) / scale;
                            dragState.current.sx = e.clientX;
                            dragState.current.sy = e.clientY;

                            let newDot = dragState.current.currentDot;
                            dragState.current.targets.forEach((tid) => {
                                if (tid.includes("->")) return;
                                const el = svg.querySelector(`g.gn-node[data-id="${tid}"]`);
                                if (!el) return;
                                const cur = el.getAttribute("transform") || "";
                                const m = cur.match(/translate\(([^,]+),\s*([^)]+)\)/);
                                const cx = m ? parseFloat(m[1]) : 0;
                                const cy = m ? parseFloat(m[2]) : 0;
                                el.setAttribute("transform", `translate(${cx + dx},${cy + dy})`);

                                const pos = positionsRef.current[tid];
                                if (pos) { pos.x = cx + dx; pos.y = cy + dy; }

                                newDot = patchNodePosition(newDot, tid, cx + dx, cy + dy);
                                shiftEdgePaths(svg, tid, dx, dy);
                            });
                            dragState.current.currentDot = newDot;
                        };

                        const onDragEnd = () => {
                            if (dragState.current) {
                                onDotChange(dragState.current.currentDot);
                            }
                            window.removeEventListener("pointermove", onDragMove as any);
                            window.removeEventListener("pointerup", onDragEnd);
                            window.removeEventListener("pointercancel", onDragEnd);
                            dragState.current = null;
                        };

                        window.addEventListener("pointermove", onDragMove as any);
                        window.addEventListener("pointerup", onDragEnd);
                        window.addEventListener("pointercancel", onDragEnd);
                    }
                } else {
                    // Lasso
                    event.preventDefault();
                    event.stopPropagation();

                    const rootCtm = svg.getScreenCTM()?.inverse();
                    if (!rootCtm) { onSelectionChange(new Set()); return; }
                    const svgPt = svg.createSVGPoint();
                    svgPt.x = event.clientX; svgPt.y = event.clientY;
                    const startPt = svgPt.matrixTransform(rootCtm);

                    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                    rect.setAttribute("class", "lasso-rect");
                    rect.setAttribute("x", String(startPt.x));
                    rect.setAttribute("y", String(startPt.y));
                    rect.setAttribute("width", "0");
                    rect.setAttribute("height", "0");
                    svg.appendChild(rect);

                    const onLassoMove = (e: PointerEvent) => {
                        const pt = svg.createSVGPoint();
                        pt.x = e.clientX; pt.y = e.clientY;
                        const cur = pt.matrixTransform(svg.getScreenCTM()!.inverse());
                        rect.setAttribute("x", String(Math.min(startPt.x, cur.x)));
                        rect.setAttribute("y", String(Math.min(startPt.y, cur.y)));
                        rect.setAttribute("width", String(Math.abs(cur.x - startPt.x)));
                        rect.setAttribute("height", String(Math.abs(cur.y - startPt.y)));
                    };

                    const onLassoEnd = () => {
                        window.removeEventListener("pointermove", onLassoMove as any);
                        window.removeEventListener("pointerup", onLassoEnd);
                        window.removeEventListener("pointercancel", onLassoEnd);
                        const lx = parseFloat(rect.getAttribute("x")!);
                        const ly = parseFloat(rect.getAttribute("y")!);
                        const lw = parseFloat(rect.getAttribute("width")!);
                        const lh = parseFloat(rect.getAttribute("height")!);
                        rect.remove();

                        if (lw < 4 && lh < 4) { onSelectionChange(new Set()); return; }

                        const selected = new Set<string>();
                        svg.querySelectorAll("g.gn-node").forEach((g) => {
                            const id = (g as HTMLElement).dataset.id;
                            if (!id) return;
                            const root = svg.querySelector("g.gn-root");
                            if (!root) return;
                            const ctm = (root as SVGGElement).getCTM();
                            const svgCtm = svg.getScreenCTM();
                            if (!ctm || !svgCtm) return;
                            const trMatch = g.getAttribute("transform")?.match(/translate\(([^,]+),\s*([^)]+)\)/);
                            if (!trMatch) return;
                            const pt = svg.createSVGPoint();
                            pt.x = parseFloat(trMatch[1]); pt.y = parseFloat(trMatch[2]);
                            const screen = pt.matrixTransform(ctm.multiply(svgCtm.inverse()));
                            if (screen.x >= lx && screen.x <= lx + lw && screen.y >= ly && screen.y <= ly + lh)
                                selected.add(id);
                        });
                        onSelectionChange(selected);
                    };

                    window.addEventListener("pointermove", onLassoMove as any);
                    window.addEventListener("pointerup", onLassoEnd);
                    window.addEventListener("pointercancel", onLassoEnd);
                }
            } else {
                if (!nodeG && !edgeG && !clusterG) onSelectionChange(new Set());
            }
        });

        // Native context menu override on the whole SVG
        svgSel.on("contextmenu.interact", (event: MouseEvent) => {
            event.preventDefault();
            const target = event.target as Element;
            const nodeG = target.closest("g.gn-node");
            const edgeG = target.closest("g.gn-edge");
            if (nodeG) {
                const nid = (nodeG as HTMLElement).dataset.id || "";
                onNodeShapeContext(nid, event.clientX, event.clientY);
                return;
            }
            if (edgeG) {
                const ds = edgeG as HTMLElement;
                onEdgeContext(`${ds.dataset.from}->${ds.dataset.to}`, event.clientX, event.clientY);
                return;
            }
        });
    }, [onSelectionChange, onEdgeContext, onNodeShapeContext]);

    // ── Main render ─────────────────────────────
    useEffect(() => {
        if (skipRender.current) { skipRender.current = false; return; }
        if (!containerRef.current || !wasmReady) return;
        let cancelled = false;

        const doRender = async () => {
            try {
                const svgStr = await gnRender(dot);
                if (cancelled) return;
                setError(null);

                const container = containerRef.current!;
                container.innerHTML = "";
                const parser = new DOMParser();
                const doc = parser.parseFromString(svgStr, "image/svg+xml");
                const newSvg = doc.querySelector("svg");
                if (!newSvg) { setError("Failed to parse SVG"); return; }

                // Remove viewBox — d3-zoom handles all positioning
                newSvg.removeAttribute("viewBox");
                newSvg.setAttribute("width", "100%");
                newSvg.setAttribute("height", "100%");
                newSvg.style.overflow = "visible";

                container.appendChild(document.adoptNode(newSvg));
                svgRef.current = newSvg;

                const positions = await gnPositions(dot);
                positionsRef.current = positions;

                setupInteractions(newSvg);
                applySelection(selRef.current);
                requestAnimationFrame(() => { if (!cancelled) centerView(); });
            } catch (e: unknown) {
                if (!cancelled) setError(e instanceof Error ? e.message : "Render error");
            }
        };

        const t = setTimeout(doRender, 16);
        return () => { cancelled = true; clearTimeout(t); };
    }, [dot, engine, wasmReady, setupInteractions, applySelection, centerView]);

    return (
        <div className="canvas-container" ref={containerRef} tabIndex={-1}
            style={{ cursor: mode === "pan" ? "grab" : "crosshair" }}>
            {!wasmReady && <div className="canvas-loading">Loading engine...</div>}
            {error && <div className="canvas-error">{error}</div>}
        </div>
    );
});

export default GraphCanvas;
