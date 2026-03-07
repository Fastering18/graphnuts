"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import SplitPane from "@/components/SplitPane";
import Toolbar from "@/components/Toolbar";
import Explorer from "@/components/Explorer";
import HelpModal from "@/components/HelpModal";
import type { LayoutMode } from "@/lib/auto-layout";
import {
    deleteNodesFromDot, renameNodeInDot,
    parseDotHierarchy, patchEdgeStyle, findNodeLine, removeAllPositions,
} from "@/lib/dot-patcher";
import { downloadText } from "@/lib/file-io";
import type { CanvasHandle, CanvasMode } from "@/components/GraphCanvas";
import type { CodeEditorHandle } from "@/components/CodeEditor";

const CodeEditor = dynamic(() => import("@/components/CodeEditor"), { ssr: false });
const GraphCanvas = dynamic(() => import("@/components/GraphCanvas"), { ssr: false });

const EDGE_STYLES = [
    { value: "solid", label: "── Solid" },
    { value: "dashed", label: "╌╌ Dashed" },
    { value: "dotted", label: "··· Dotted" },
    { value: "bold", label: "━━ Bold" },
];

const DEFAULT_DOT = `digraph G {
    graph [rankdir=LR bgcolor="#0f172a" fontname="Inter, sans-serif" pad=0.5]
    node [shape=rect style="filled,rounded" fillcolor="#1e293b" color="#334155" fontname="Inter, sans-serif" fontcolor="#f8fafc" margin="0.3,0.2"]
    edge [color="#64748b" fontname="Inter, sans-serif" fontcolor="#94a3b8" penwidth=1.5]

    subgraph cluster_frontend {
        label="Frontend"
        fontcolor="#f8fafc" color="#3b82f6" bgcolor="#172554" style="rounded"
        Client [label="Web Client"]
        Mobile [label="Mobile App"]
    }

    subgraph cluster_backend {
        label="Backend Services"
        fontcolor="#f8fafc" color="#10b981" bgcolor="#064e3b" style="rounded"
        API [label="API Gateway\n(GraphQL)" fillcolor="#059669"]
        Auth [label="Auth Service"]
        DB [label="Primary DB\n(PostgreSQL)" shape=cylinder fillcolor="#334155"]
        Cache [label="Redis Cache" shape=cylinder fillcolor="#334155"]
    }

    Client -> API [label=" HTTPS POST "]
    Mobile -> API [label=" HTTPS POST "]
    API -> Auth [label=" gRPC verify "]
    API -> Cache [label=" Check user session "]
    API -> DB [label=" Query User Data "]
    Auth -> DB [label=" Read/Write "]
}`;

export default function EditorPage() {
    const params = useParams();
    const id = params.id as string;
    const canvasRef = useRef<CanvasHandle>(null);
    const editorRef = useRef<CodeEditorHandle>(null);

    const [dot, setDot] = useState(() => {
        if (typeof window !== "undefined") return sessionStorage.getItem(`gn_${id}`) || DEFAULT_DOT;
        return DEFAULT_DOT;
    });
    const [filename, setFilename] = useState(() => {
        if (typeof window !== "undefined") return sessionStorage.getItem(`gn_name_${id}`) || "untitled.gn";
        return "untitled.gn";
    });
    const [engine] = useState("gn");
    const [selection, setSelection] = useState<Set<string>>(new Set());
    const [mode, setMode] = useState<CanvasMode>("select");
    const [showHelp, setShowHelp] = useState(false);
    const [showExplorer, setShowExplorer] = useState(true);
    const [showEditor, setShowEditor] = useState(true);
    const [showPreview, setShowPreview] = useState(true);
    const [edgeCtx, setEdgeCtx] = useState<{ id: string; x: number; y: number } | null>(null);

    const hierarchy = parseDotHierarchy(dot);

    useEffect(() => { sessionStorage.setItem(`gn_${id}`, dot); }, [dot, id]);
    useEffect(() => { sessionStorage.setItem(`gn_name_${id}`, filename); }, [filename, id]);

    useEffect(() => {
        if (!edgeCtx) return;
        const handler = () => setEdgeCtx(null);
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [edgeCtx]);

    const handleLayout = useCallback(async (m: LayoutMode) => {
        // Remove positions and let WASM re-layout
        const clean = removeAllPositions(dot);
        setDot(clean);
    }, [dot]);

    const handleDotChange = useCallback((newDot: string) => setDot(newDot), []);

    const handleDelete = useCallback((ids?: string[]) => {
        const toDelete = ids || [...selection].filter((i) => !i.includes("->") && !i.startsWith("cluster"));
        if (toDelete.length > 0) {
            setDot((prev) => deleteNodesFromDot(prev, toDelete));
            setSelection(new Set());
        }
    }, [selection]);

    const handleRename = useCallback((oldId: string, newId: string) => {
        setDot((prev) => renameNodeInDot(prev, oldId, newId));
    }, []);

    const handleSelectAll = useCallback(() => {
        // Parse node IDs from the current SVG
        const svg = canvasRef.current?.getSvg();
        if (!svg) return;
        const ids = new Set<string>();
        svg.querySelectorAll("g.gn-node").forEach((g) => {
            const id = (g as HTMLElement).dataset.id;
            if (id) ids.add(id);
        });
        setSelection(ids);
    }, []);

    const handleExplorerSelect = useCallback((sel: Set<string>) => {
        setSelection(sel);
        if (sel.size === 1) {
            const nodeId = [...sel][0];
            const line = findNodeLine(dot, nodeId);
            setTimeout(() => editorRef.current?.scrollToLine(line), 50);
        }
    }, [dot]);

    const handleEdgeContext = useCallback((edgeId: string, x: number, y: number) => {
        setEdgeCtx({ id: edgeId, x, y });
    }, []);

    const handleEdgeStyle = useCallback((style: string) => {
        if (!edgeCtx) return;
        const parts = edgeCtx.id.split("->");
        if (parts.length === 2) {
            setDot((prev) => patchEdgeStyle(prev, parts[0].trim(), parts[1].trim(), style));
        }
        setEdgeCtx(null);
    }, [edgeCtx]);

    const handleCenterView = useCallback(() => {
        canvasRef.current?.centerView();
    }, []);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const inEditor = (e.target as HTMLElement).closest(".cm-editor");
            if (e.key === "?" && !inEditor) { e.preventDefault(); setShowHelp((p) => !p); return; }
            if (e.key === "Escape") {
                if (edgeCtx) { setEdgeCtx(null); return; }
                if (showHelp) { setShowHelp(false); return; }
                setSelection(new Set());
                return;
            }
            if ((e.key === "Delete" || e.key === "Backspace") && !inEditor) { e.preventDefault(); handleDelete(); return; }
            if (e.key === "a" && (e.ctrlKey || e.metaKey) && !inEditor) { e.preventDefault(); handleSelectAll(); return; }
            if (e.key === "s" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); downloadText(dot, filename); return; }
            if (e.key === "e" && (e.ctrlKey || e.metaKey) && !inEditor) { e.preventDefault(); setShowExplorer((p) => !p); return; }
            if (e.key === "h" && !inEditor && !(e.ctrlKey || e.metaKey)) { setMode("pan"); return; }
            if (e.key === "v" && !inEditor && !(e.ctrlKey || e.metaKey)) { setMode("select"); return; }
            if (e.key === "c" && !inEditor && !(e.ctrlKey || e.metaKey)) { handleCenterView(); return; }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [showHelp, edgeCtx, handleDelete, handleSelectAll, dot, filename, handleCenterView]);

    const renderEditorAndPreview = () => {
        if (showEditor && showPreview) {
            return (
                <SplitPane
                    left={<CodeEditor ref={editorRef} value={dot} onChange={handleDotChange} />}
                    right={
                        <GraphCanvas
                            ref={canvasRef}
                            dot={dot}
                            engine={engine}
                            mode={mode}
                            onDotChange={handleDotChange}
                            selection={selection}
                            onSelectionChange={setSelection}
                            onEdgeContext={handleEdgeContext}
                        />
                    }
                    defaultRatio={0.4}
                />
            );
        }
        if (showEditor) return <CodeEditor ref={editorRef} value={dot} onChange={handleDotChange} />;
        if (showPreview) return (
            <GraphCanvas
                ref={canvasRef}
                dot={dot}
                engine={engine}
                mode={mode}
                onDotChange={handleDotChange}
                selection={selection}
                onSelectionChange={setSelection}
                onEdgeContext={handleEdgeContext}
            />
        );
        return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", width: "100%", color: "var(--text-muted)" }}>Nothing to show</div>;
    };

    return (
        <div className="editor-layout">
            <Toolbar
                filename={filename}
                dot={dot}
                svgRef={{ current: canvasRef.current?.getSvg() ?? null } as React.RefObject<SVGSVGElement | null>}
                onFilenameChange={setFilename}
                onDotChange={(newDot) => setDot(newDot)}
                onLayout={handleLayout}
                mode={mode}
                onModeChange={setMode}
                onCenterView={handleCenterView}
                showExplorer={showExplorer}
                showEditor={showEditor}
                showPreview={showPreview}
                onToggleExplorer={() => setShowExplorer((p) => !p)}
                onToggleEditor={() => setShowEditor((p) => !p)}
                onTogglePreview={() => setShowPreview((p) => !p)}
            />
            <div className="editor-main">
                {showExplorer ? (
                    <SplitPane
                        left={
                            <Explorer
                                elements={hierarchy}
                                selection={selection}
                                onSelectionChange={handleExplorerSelect}
                                onDelete={handleDelete}
                                onRename={handleRename}
                            />
                        }
                        right={renderEditorAndPreview()}
                        defaultRatio={0.2}
                    />
                ) : (
                    renderEditorAndPreview()
                )}
            </div>
            <div className="status-bar">
                <div className="status-dot" />
                <span>Ready</span>
                <span className="status-mode">{mode === "pan" ? "🖐 Pan" : "⬚ Select"}</span>
                {selection.size > 0 && <span className="status-sel">{selection.size} selected</span>}
                <span style={{ marginLeft: "auto" }}>Engine: WASM</span>
                <span>|</span>
                <span>{dot.split("\n").length} lines</span>
                <span>|</span>
                <button className="status-help-btn" onClick={() => setShowHelp(true)}>? Help</button>
            </div>
            <HelpModal open={showHelp} onClose={() => setShowHelp(false)} />

            {edgeCtx && (
                <div className="context-menu" style={{ top: edgeCtx.y, left: edgeCtx.x }}
                    onMouseDown={(e) => e.stopPropagation()}>
                    <div style={{ padding: "6px 10px", fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>
                        Edge Style
                    </div>
                    <div className="context-sep" />
                    {EDGE_STYLES.map((s) => (
                        <button key={s.value} className="context-item" onClick={() => handleEdgeStyle(s.value)}>
                            {s.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
