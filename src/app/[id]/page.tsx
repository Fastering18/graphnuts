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
import { useSession } from "next-auth/react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { CodeEditorHandle } from "@/components/CodeEditor";
import type { CanvasHandle, CanvasMode } from "@/components/GraphCanvas";
import { toast } from "sonner";

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

    const { data: session } = useSession();
    const isConvexId = id.length > 20;
    const graphData = useQuery(api.graphs.getGraph, isConvexId ? { id: id as Id<"graphs"> } : "skip");
    const saveGraph = useMutation(api.graphs.saveGraph);

    // Explicitly compute permissions that properly handles Guest + Loading states
    const canEdit = isConvexId
        ? (graphData === undefined ? true // optimistic during load
            : graphData === null ? false // invalid graph
                : (!graphData.userId || graphData.isPublicEditable
                    ? true
                    : Boolean(session?.user?.id && session.user.id === graphData.userId)))
        : true;

    const [dot, setDot] = useState(() => {
        if (typeof window !== "undefined") return sessionStorage.getItem(`gn_${id}`) || DEFAULT_DOT;
        return DEFAULT_DOT;
    });
    const [filename, setFilename] = useState(() => {
        if (typeof window !== "undefined") return sessionStorage.getItem(`gn_name_${id}`) || "untitled.gn";
        return "untitled.gn";
    });

    // ── Undo / Redo system ───────────────────────────────────────
    const historyRef = useRef<string[]>([]);
    const historyIndexRef = useRef(-1);
    const isUndoRedoRef = useRef(false);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [historyMeta, setHistoryMeta] = useState({ canUndo: false, canRedo: false });

    // Seed history on mount
    useEffect(() => {
        const initial = (typeof window !== "undefined" ? sessionStorage.getItem(`gn_${id}`) : null) || DEFAULT_DOT;
        historyRef.current = [initial];
        historyIndexRef.current = 0;
        setHistoryMeta({ canUndo: false, canRedo: false });
    }, [id]);

    // Push a snapshot into the history stack (called on change, debounced)
    const pushHistory = useCallback((snapshot: string) => {
        const h = historyRef.current;
        const idx = historyIndexRef.current;
        // Don't push if it's the same as the current entry
        if (h[idx] === snapshot) return;
        // Truncate any redo entries
        const newHistory = h.slice(0, idx + 1);
        newHistory.push(snapshot);
        // Cap at 50 entries
        if (newHistory.length > 50) {
            newHistory.shift();
        }
        historyRef.current = newHistory;
        historyIndexRef.current = newHistory.length - 1;
        setHistoryMeta({ canUndo: historyIndexRef.current > 0, canRedo: false });
    }, []);

    const updateDot = useCallback((action: string | ((prev: string) => string)) => {
        setDot(prev => {
            const newDot = typeof action === 'function' ? action(prev) : action;
            if (newDot === prev) return prev;

            // If this change is from undo/redo, don't push history
            if (isUndoRedoRef.current) return newDot;

            // Debounce: only push a history snapshot after 500ms of inactivity
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = setTimeout(() => {
                pushHistory(newDot);
            }, 500);

            return newDot;
        });
    }, [pushHistory]);

    const handleUndo = useCallback(() => {
        const h = historyRef.current;
        const idx = historyIndexRef.current;

        // If the user has been typing and hasn't committed yet, commit current state first
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }
        // Grab the current live dot to snapshot before undoing
        setDot(currentDot => {
            const hNow = historyRef.current;
            const idxNow = historyIndexRef.current;
            // If current text differs from the latest history entry, push it first
            if (hNow[idxNow] !== currentDot) {
                pushHistory(currentDot);
            }
            // Now undo
            const h2 = historyRef.current;
            const idx2 = historyIndexRef.current;
            if (idx2 > 0) {
                historyIndexRef.current = idx2 - 1;
                isUndoRedoRef.current = true;
                const target = h2[idx2 - 1];
                setHistoryMeta({ canUndo: idx2 - 1 > 0, canRedo: true });
                // Use setTimeout to reset the flag after React commits
                setTimeout(() => { isUndoRedoRef.current = false; }, 0);
                return target;
            }
            return currentDot;
        });
    }, [pushHistory]);

    const handleRedo = useCallback(() => {
        const h = historyRef.current;
        const idx = historyIndexRef.current;
        if (idx < h.length - 1) {
            historyIndexRef.current = idx + 1;
            isUndoRedoRef.current = true;
            setHistoryMeta({ canUndo: true, canRedo: idx + 1 < h.length - 1 });
            setDot(h[idx + 1]);
            setTimeout(() => { isUndoRedoRef.current = false; }, 0);
        }
    }, []);


    // Manage Cloud Save Status UI
    const [saveStatus, setSaveStatus] = useState<"unsaved" | "saving" | "saved">("saved");
    const [showShare, setShowShare] = useState(false);

    const remoteDot = useRef<string | null>(null);
    const remoteTitle = useRef<string | null>(null);

    // Populate from Convex once loaded
    useEffect(() => {
        if (graphData && isConvexId) {
            if (remoteDot.current === null) {
                setDot(graphData.dotSource);
                setFilename(graphData.title);
                remoteDot.current = graphData.dotSource;
                remoteTitle.current = graphData.title;
                setSaveStatus("saved");
            } else if (graphData.dotSource !== remoteDot.current || graphData.title !== remoteTitle.current) {
                // If the remote graph was updated by SOMEONE ELSE, and we aren't actively typing...
                const dotClean = dot === remoteDot.current;
                const titleClean = filename === remoteTitle.current;

                if (dotClean && titleClean) {
                    setDot(graphData.dotSource);
                    setFilename(graphData.title);
                    remoteDot.current = graphData.dotSource;
                    remoteTitle.current = graphData.title;
                    setSaveStatus("saved");
                }
            }
        }
    }, [graphData, isConvexId, dot, filename]);

    const [engine] = useState("gn");
    const [selection, setSelection] = useState<Set<string>>(new Set());
    const [mode, setMode] = useState<CanvasMode>("select");
    const [showHelp, setShowHelp] = useState(false);
    const [showExplorer, setShowExplorer] = useState(true);
    const [showEditor, setShowEditor] = useState(true);
    const [showPreview, setShowPreview] = useState(true);
    const [edgeCtx, setEdgeCtx] = useState<{ id: string; x: number; y: number } | null>(null);
    const [nodeCtx, setNodeCtx] = useState<{ id: string; x: number; y: number } | null>(null);

    const hierarchy = parseDotHierarchy(dot);

    // Sync to Convex
    useEffect(() => {
        sessionStorage.setItem(`gn_${id}`, dot);

        // If it differs from the last known remote config, mark as unsaved
        if (dot !== remoteDot.current || filename !== remoteTitle.current) {
            setSaveStatus("unsaved");
        }

        if (canEdit && (dot !== remoteDot.current || filename !== remoteTitle.current)) {
            const timer = setTimeout(() => {
                setSaveStatus("saving");
                const currentDot = dot;
                const currentFilename = filename;
                remoteDot.current = currentDot;
                remoteTitle.current = currentFilename;

                saveGraph({
                    id: id as Id<"graphs">,
                    userId: session?.user?.id,
                    title: currentFilename,
                    dotSource: currentDot,
                    isPublic: Boolean(graphData?.isPublic),
                    isPublicEditable: Boolean(graphData?.isPublicEditable),
                }).then(() => {
                    // Only mark saved if we haven't typed more
                    if (currentDot === dot && currentFilename === filename) {
                        setSaveStatus("saved");
                    }
                }).catch(err => {
                    console.error("Save failed", err);
                    setSaveStatus("unsaved");
                    toast.error("Failed to save to cloud");
                });
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [dot, filename, id, isConvexId, session, saveGraph, graphData]);

    useEffect(() => { sessionStorage.setItem(`gn_name_${id}`, filename); }, [filename, id]);

    useEffect(() => {
        if (!edgeCtx && !nodeCtx) return;
        const handler = () => { setEdgeCtx(null); setNodeCtx(null); };
        document.addEventListener("pointerdown", handler);
        return () => document.removeEventListener("pointerdown", handler);
    }, [edgeCtx, nodeCtx]);

    const handleLayout = useCallback(async (m: LayoutMode) => {
        if (!canEdit) return;
        // Remove positions and let WASM re-layout
        const clean = removeAllPositions(dot);
        updateDot(clean);

    }, [dot, updateDot, canEdit]);

    const handleDotChange = useCallback((newDot: string) => {
        if (canEdit) updateDot(newDot);
    }, [updateDot, canEdit]);

    const handleDelete = useCallback((ids?: string[]) => {
        if (!canEdit) return;
        const toDelete = ids || [...selection].filter((i) => !i.includes("->") && !i.startsWith("cluster"));
        if (toDelete.length > 0) {
            updateDot((prev) => deleteNodesFromDot(prev, toDelete));
            setSelection(new Set());
        }
    }, [selection]);

    const handleRename = useCallback((oldId: string, newId: string) => {
        if (canEdit) updateDot((prev) => renameNodeInDot(prev, oldId, newId));
    }, [updateDot, canEdit]);

    const handleSelectAll = useCallback(() => {
        // Parse node IDs from the current SVG
        const svg = canvasRef.current?.getSvg();
        if (!svg) return;
        const ids = new Set<string>();
        svg.querySelectorAll("g.gn-node").forEach((g: Element) => {
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
        if (!canEdit) return;
        setEdgeCtx({ id: edgeId, x, y });
        setNodeCtx(null);
    }, [canEdit]);

    const handleNodeShapeContext = useCallback((nodeId: string, x: number, y: number) => {
        if (!canEdit) return;
        setNodeCtx({ id: nodeId, x, y });
        setEdgeCtx(null);
    }, [canEdit]);

    const handleEdgeStyle = useCallback((style: string) => {
        if (!edgeCtx) return;
        const parts = edgeCtx.id.split("->");
        if (parts.length === 2) {
            updateDot((prev) => patchEdgeStyle(prev, parts[0].trim(), parts[1].trim(), style));
        }
        setEdgeCtx(null);
    }, [edgeCtx]);

    const handleNodeShape = useCallback((shape: string) => {
        if (!nodeCtx) return;
        updateDot((prev) => {
            const lines = prev.split("\n");

            const nodeLineIdx = lines.findIndex(l => {
                if (l.includes("->")) return false;
                const trimmed = l.trim();
                const idRegex = new RegExp(`^"?${nodeCtx.id.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}"?\\s*(?:\\[|$)`);
                return idRegex.test(trimmed);
            });

            if (nodeLineIdx !== -1) {
                const line = lines[nodeLineIdx];
                const shapeRegex = /shape="?[a-zA-Z0-9]+"?(?=[\] \t]|$)/;
                if (shapeRegex.test(line)) {
                    lines[nodeLineIdx] = line.replace(shapeRegex, `shape=${shape}`);
                } else if (line.includes("[")) {
                    lines[nodeLineIdx] = line.replace("[", `[shape=${shape} `);
                } else {
                    lines[nodeLineIdx] = `${line.trim()} [shape=${shape}]`;
                }
            } else {
                const lastBraceIdx = lines.findLastIndex(l => l.trim() === "}");
                if (lastBraceIdx !== -1) {
                    lines.splice(lastBraceIdx, 0, `    "${nodeCtx.id}" [shape=${shape}]`);
                } else {
                    lines.push(`    "${nodeCtx.id}" [shape=${shape}]`);
                }
            }
            return lines.join("\n");
        });
        setNodeCtx(null);
    }, [nodeCtx]);

    const handleCenterView = useCallback(() => {
        canvasRef.current?.centerView();
    }, []);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const inEditor = !!target.closest(".cm-editor");
            const inInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA";

            // Undo / Redo
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
                if (inInput && !inEditor) return; // browser undo in text inputs
                e.preventDefault();
                if (e.shiftKey) handleRedo();
                else handleUndo();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
                if (inInput && !inEditor) return;
                e.preventDefault();
                handleRedo();
                return;
            }

            // Other shortcuts
            if (e.key === "?" && !inEditor) { e.preventDefault(); setShowHelp((p) => !p); return; }
            if (e.key === "Escape") {
                if (edgeCtx || nodeCtx) { setEdgeCtx(null); setNodeCtx(null); return; }
                if (showHelp) { setShowHelp(false); return; }
                setSelection(new Set());
                return;
            }

            if ((e.key === "Delete" || e.key === "Backspace") && !inEditor && !inInput) { e.preventDefault(); handleDelete(); return; }
            if (e.key === "a" && (e.ctrlKey || e.metaKey) && !inEditor && !inInput) { e.preventDefault(); handleSelectAll(); return; }
            if (e.key === "s" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); downloadText(dot, filename); return; }
            if (e.key === "e" && (e.ctrlKey || e.metaKey) && !inEditor) { e.preventDefault(); setShowExplorer((p) => !p); return; }

            if (inEditor || inInput) return;

            if (e.key === "h") { setMode("pan"); return; }
            if (e.key === "v") { setMode("select"); return; }
            if (e.key === "c") { handleCenterView(); return; }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [showHelp, edgeCtx, handleDelete, handleSelectAll, dot, filename, handleCenterView, handleUndo, handleRedo]);

    const renderEditorAndPreview = () => {
        if (showEditor && showPreview) {
            return (
                <SplitPane
                    left={<CodeEditor key={`editor-${canEdit}`} ref={editorRef} value={dot} onChange={handleDotChange} readOnly={!canEdit} />}
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
                            onNodeShapeContext={handleNodeShapeContext}
                        />
                    }
                    defaultRatio={0.4}
                />
            );
        }
        if (showEditor) return <CodeEditor key={`editor-${canEdit}`} ref={editorRef} value={dot} onChange={handleDotChange} readOnly={!canEdit} />;
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
                onNodeShapeContext={handleNodeShapeContext}
            />
        );
        return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", width: "100%", color: "var(--text-muted)" }}>Nothing to show</div>;
    };

    return (
        <div className="editor-layout">
            {showShare && (
                <div className="modal-overlay" onClick={() => setShowShare(false)} style={{ zIndex: 1000, position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ background: "#1e293b", padding: 24, borderRadius: 12, minWidth: 400, boxShadow: "0 20px 40px rgba(0,0,0,0.4)", border: "1px solid #334155" }}>
                        <h2 style={{ margin: "0 0 16px 0", fontSize: 20 }}>Share Graph</h2>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
                            <label style={{ fontSize: 13, color: "#94a3b8" }}>Canonical Link</label>
                            <div style={{ display: "flex", gap: 8 }}>
                                <input
                                    readOnly
                                    value={typeof window !== "undefined" ? window.location.href : ""}
                                    style={{ flex: 1, background: "#0f172a", border: "1px solid #334155", borderRadius: 6, padding: "8px 12px", color: "#f8fafc" }}
                                />
                                <button className="btn btn-secondary" onClick={() => {
                                    navigator.clipboard.writeText(window.location.href);
                                    toast.success("Link copied to clipboard");
                                }}>Copy</button>
                            </div>
                        </div>

                        {Boolean(session?.user?.id && session.user.id === graphData?.userId) && isConvexId ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
                                    <input
                                        type="checkbox"
                                        checked={graphData?.isPublic || false}
                                        onChange={async (e) => {
                                            await saveGraph({ id: id as Id<"graphs">, userId: session?.user?.id, title: filename, dotSource: dot, isPublic: e.target.checked, isPublicEditable: Boolean(graphData?.isPublicEditable) });
                                        }}
                                    />
                                    Anyone with link can view
                                </label>
                                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, opacity: graphData?.isPublic ? 1 : 0.5 }}>
                                    <input
                                        type="checkbox"
                                        checked={graphData?.isPublicEditable || false}
                                        onChange={async (e) => {
                                            await saveGraph({ id: id as Id<"graphs">, userId: session?.user?.id, title: filename, dotSource: dot, isPublic: Boolean(graphData?.isPublic), isPublicEditable: e.target.checked });
                                        }}
                                        disabled={!graphData?.isPublic}
                                    />
                                    Anyone with link can edit
                                </label>
                            </div>
                        ) : (
                            <div style={{ fontSize: 13, color: "#94a3b8" }}>
                                Only the owner can change sharing settings.
                                {!isConvexId && " Please sign in and save to Convex first!"}
                            </div>
                        )}
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
                            <button className="btn btn-primary" onClick={() => setShowShare(false)}>Done</button>
                        </div>
                    </div>
                </div>
            )}

            <Toolbar
                filename={filename}
                dot={dot}
                saveStatus={saveStatus}
                user={session?.user}
                isOwner={Boolean(session?.user?.id && session.user.id === graphData?.userId)}
                svgRef={{ current: canvasRef.current?.getSvg() ?? null } as React.RefObject<SVGSVGElement | null>}
                onFilenameChange={setFilename}
                onDotChange={(newDot) => setDot(newDot)}
                onLayout={handleLayout}
                mode={mode}
                onModeChange={setMode}
                onCenterView={handleCenterView}
                onShare={() => setShowShare(true)}
                showExplorer={showExplorer}
                showEditor={showEditor}
                showPreview={showPreview}
                onToggleExplorer={() => setShowExplorer((p) => !p)}
                onToggleEditor={() => setShowEditor((p) => !p)}
                onTogglePreview={() => setShowPreview((p) => !p)}
                onUndo={handleUndo}
                onRedo={handleRedo}
                canUndo={historyMeta.canUndo}
                canRedo={historyMeta.canRedo}
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
                    onPointerDown={(e) => e.stopPropagation()}>
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

            {nodeCtx && (
                <div className="context-menu" style={{ top: nodeCtx.y, left: nodeCtx.x }}
                    onPointerDown={(e) => e.stopPropagation()}>
                    <div style={{ padding: "6px 10px", fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>
                        Node Shape
                    </div>
                    <div className="context-sep" />
                    {[
                        { value: "box", label: "⬜ Box" },
                        { value: "ellipse", label: "⭕ Ellipse" },
                        { value: "diamond", label: "💎 Diamond" },
                        { value: "cylinder", label: "🛢️ Cylinder" },
                        { value: "invhouse", label: "🏳️ Flag" },
                        { value: "folder", label: "📁 Folder" },
                    ].map((s) => (
                        <button key={s.value} className="context-item" onClick={() => handleNodeShape(s.value)}>
                            {s.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
