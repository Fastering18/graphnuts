"use client";

import { useState, useRef, useEffect } from "react";
import type { CanvasMode } from "@/components/GraphCanvas";
import { LAYOUT_OPTIONS, type LayoutMode } from "@/lib/auto-layout";
import { loadFile, downloadText, downloadSvg, downloadImage, downloadPdf } from "@/lib/file-io";

interface Props {
    filename: string;
    dot: string;
    saveStatus?: "unsaved" | "saving" | "saved";
    user?: { name?: string | null; email?: string | null; image?: string | null };
    isOwner?: boolean;
    svgRef: React.RefObject<SVGSVGElement | null>;
    onFilenameChange: (name: string) => void;
    onDotChange: (dot: string) => void;
    onLayout: (mode: LayoutMode) => void;
    mode: CanvasMode;
    onModeChange: (mode: CanvasMode) => void;
    onCenterView: () => void;
    onShare: () => void;
    showExplorer: boolean;
    showEditor: boolean;
    showPreview: boolean;
    onToggleExplorer: () => void;
    onToggleEditor: () => void;
    onTogglePreview: () => void;
}

export default function Toolbar({
    filename, dot, saveStatus = "saved", user, isOwner, svgRef, onFilenameChange, onDotChange, onLayout,
    mode, onModeChange, onCenterView, onShare,
    showExplorer, showEditor, showPreview,
    onToggleExplorer, onToggleEditor, onTogglePreview
}: Props) {
    const [openMenu, setOpenMenu] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(null);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const toggle = (name: string) => setOpenMenu(openMenu === name ? null : name);

    const handleOpen = async () => {
        setOpenMenu(null);
        const result = await loadFile();
        if (result) { onDotChange(result.content); onFilenameChange(result.name); }
    };

    const handleSave = () => { setOpenMenu(null); downloadText(dot, filename); };

    const handleExport = async (fmt: string) => {
        setOpenMenu(null);
        const el = svgRef.current;
        if (!el) return;
        const base = filename.replace(/\.\w+$/, "");
        if (fmt === "svg") downloadSvg(el, `${base}.svg`);
        else if (fmt === "png") await downloadImage(el, `${base}.png`, "png");
        else if (fmt === "jpg") await downloadImage(el, `${base}.jpg`, "jpg");
        else if (fmt === "pdf") await downloadPdf(el, `${base}.pdf`);
    };

    return (
        <div className="toolbar" ref={menuRef}>
            <a href="/" className="btn btn-icon" title="Home">🏠</a>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                    className="toolbar-filename"
                    value={filename}
                    onChange={(e) => onFilenameChange(e.target.value)}
                    spellCheck={false}
                    disabled={saveStatus === "saving"}
                    style={{ paddingRight: 32 }}
                />
                <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex", opacity: 0.7 }}>
                    {saveStatus === "saved" && <span title="Cloud Saved" style={{ color: "var(--success)" }}>✓</span>}
                    {saveStatus === "saving" && <span title="Saving..." style={{ color: "var(--accent)", animation: "pulse 1s infinite" }}>↻</span>}
                    {saveStatus === "unsaved" && <span title="Unsaved changes" style={{ color: "var(--warning)", fontSize: 18, lineHeight: 0.8 }}>•</span>}
                </div>
            </div>
            <div className="toolbar-separator" />

            <div className="mode-toggle">
                <button className={`mode-btn ${mode === "pan" ? "active" : ""}`}
                    onClick={() => onModeChange("pan")} title="Pan mode (H)">🖐</button>
                <button className={`mode-btn ${mode === "select" ? "active" : ""}`}
                    onClick={() => onModeChange("select")} title="Select mode (V)">⬚</button>
            </div>

            <button className="btn btn-icon" onClick={onCenterView} title="Center view (C)">⊙</button>
            <div className="toolbar-separator" />

            <div className="toolbar-group">
                <button className="btn btn-secondary" onClick={handleOpen}>📂 Open</button>
                <button className="btn btn-secondary" onClick={handleSave}>💾 Save File</button>
                <button className="btn btn-primary" onClick={onShare}>🌐 Share</button>
            </div>

            <div className="toolbar-spacer" />

            <div className="dropdown">
                <button className="btn btn-secondary" onClick={() => toggle("view")}>👁 View ▾</button>
                <div className={`dropdown-menu ${openMenu === "view" ? "open" : ""}`}>
                    <button className="dropdown-item" onClick={onToggleExplorer}>
                        {showExplorer ? "✓ " : "  "} Explorer
                    </button>
                    <button className="dropdown-item" onClick={onToggleEditor}>
                        {showEditor ? "✓ " : "  "} Code Editor
                    </button>
                    <button className="dropdown-item" onClick={onTogglePreview}>
                        {showPreview ? "✓ " : "  "} Preview
                    </button>
                </div>
            </div>

            <div className="dropdown">
                <button className="btn btn-secondary" onClick={() => toggle("layout")}>✦ Layout ▾</button>
                <div className={`dropdown-menu ${openMenu === "layout" ? "open" : ""}`}>
                    {LAYOUT_OPTIONS.map((opt) => (
                        <button key={opt.value} className="dropdown-item" onClick={() => { onLayout(opt.value); setOpenMenu(null); }}>
                            {opt.icon} {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="dropdown">
                <button className="btn btn-secondary" onClick={() => toggle("export")}>📤 Export ▾</button>
                <div className={`dropdown-menu ${openMenu === "export" ? "open" : ""}`}>
                    {["svg", "png", "jpg", "pdf"].map((fmt) => (
                        <button key={fmt} className="dropdown-item" onClick={() => handleExport(fmt)}>{fmt.toUpperCase()}</button>
                    ))}
                </div>
            </div>

            {user && (
                <>
                    <div className="toolbar-separator" />
                    <div className="toolbar-group" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        {isOwner && (
                            <span
                                title="You are the owner of this graph"
                                style={{ fontSize: 11, fontWeight: "bold", color: "var(--accent)", padding: "4px 8px", background: "var(--accent-glow)", borderRadius: 12, border: "1px solid var(--accent)", textTransform: "uppercase", letterSpacing: 0.5 }}
                            >
                                Owner
                            </span>
                        )}
                        <img
                            src={user.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || user.email || "U")}&background=random`}
                            alt="Profile"
                            style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid var(--border)", objectFit: "cover" }}
                            title={user.name || user.email || "User Profile"}
                        />
                    </div>
                </>
            )}
        </div>
    );
}
