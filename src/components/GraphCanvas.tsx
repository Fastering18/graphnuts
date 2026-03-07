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
}

interface NodePos { x: number; y: number; w: number; h: number; }

const GraphCanvas = forwardRef<CanvasHandle, Props>(function GraphCanvas(
    { dot, engine, mode, onDotChange, selection, onSelectionChange, onEdgeContext }, ref
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

        svgSel.on("mousedown.interact", (event: MouseEvent) => {
            if (event.button !== 0) return;
            const target = event.target as Element;
            const nodeG = target.closest("g.gn-node");
            const edgeG = target.closest("g.gn-edge");
            const clusterG = target.closest("g.gn-cluster");

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

                        const onDragMove = (e: MouseEvent) => {
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
                            });
                            dragState.current.currentDot = newDot;
                            onDotChange(newDot);
                        };

                        const onDragEnd = () => {
                            window.removeEventListener("mousemove", onDragMove);
                            window.removeEventListener("mouseup", onDragEnd);
                            dragState.current = null;
                        };

                        window.addEventListener("mousemove", onDragMove);
                        window.addEventListener("mouseup", onDragEnd);
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

                    const onLassoMove = (e: MouseEvent) => {
                        const pt = svg.createSVGPoint();
                        pt.x = e.clientX; pt.y = e.clientY;
                        const cur = pt.matrixTransform(svg.getScreenCTM()!.inverse());
                        rect.setAttribute("x", String(Math.min(startPt.x, cur.x)));
                        rect.setAttribute("y", String(Math.min(startPt.y, cur.y)));
                        rect.setAttribute("width", String(Math.abs(cur.x - startPt.x)));
                        rect.setAttribute("height", String(Math.abs(cur.y - startPt.y)));
                    };

                    const onLassoEnd = () => {
                        window.removeEventListener("mousemove", onLassoMove);
                        window.removeEventListener("mouseup", onLassoEnd);
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

                    window.addEventListener("mousemove", onLassoMove);
                    window.addEventListener("mouseup", onLassoEnd);
                }
            } else {
                if (!nodeG && !edgeG && !clusterG) onSelectionChange(new Set());
            }
        });

        svgSel.on("contextmenu.edge", (event: MouseEvent) => {
            const edgeG = (event.target as Element).closest("g.gn-edge");
            if (!edgeG) return;
            event.preventDefault();
            const ds = edgeG as HTMLElement;
            onEdgeContext(`${ds.dataset.from}->${ds.dataset.to}`, event.clientX, event.clientY);
        });
    }, [onSelectionChange, onEdgeContext]);

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
