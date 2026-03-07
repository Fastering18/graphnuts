"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { GraphElement } from "@/lib/dot-patcher";

interface Props {
    elements: GraphElement[];
    selection: Set<string>;
    onSelectionChange: (sel: Set<string>) => void;
    onDelete: (ids: string[]) => void;
    onRename: (oldId: string, newId: string) => void;
}

interface ContextMenu {
    x: number;
    y: number;
    element: GraphElement;
}

export default function Explorer({ elements, selection, onSelectionChange, onDelete, onRename }: Props) {
    const [search, setSearch] = useState("");
    const [ctx, setCtx] = useState<ContextMenu | null>(null);
    const [renaming, setRenaming] = useState<string | null>(null);
    const [renameVal, setRenameVal] = useState("");
    const ctxRef = useRef<HTMLDivElement>(null);
    const renameInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtx(null);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    useEffect(() => {
        if (renaming && renameInputRef.current) {
            renameInputRef.current.focus();
            renameInputRef.current.select();
        }
    }, [renaming]);

    const handleClick = useCallback((id: string, e: React.MouseEvent) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
            const next = new Set(selection);
            next.has(id) ? next.delete(id) : next.add(id);
            onSelectionChange(next);
        } else {
            onSelectionChange(new Set([id]));
        }
    }, [selection, onSelectionChange]);

    const handleContext = useCallback((e: React.MouseEvent, el: GraphElement) => {
        e.preventDefault();
        e.stopPropagation();
        setCtx({ x: e.clientX, y: e.clientY, element: el });
    }, []);

    const handleRenameSubmit = useCallback(() => {
        if (renaming && renameVal.trim() && renameVal !== renaming) {
            onRename(renaming, renameVal.trim());
        }
        setRenaming(null);
    }, [renaming, renameVal, onRename]);

    const filtered = search
        ? filterElements(elements, search.toLowerCase())
        : elements;

    return (
        <div className="explorer" onContextMenu={(e) => e.preventDefault()}>
            <div className="explorer-header">
                <span className="explorer-title">Explorer</span>
                <span className="explorer-count">{countElements(elements)}</span>
            </div>
            <div className="explorer-search">
                <input
                    type="text"
                    placeholder="Search nodes..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="explorer-search-input"
                    spellCheck={false}
                />
                {search && (
                    <button className="explorer-search-clear" onClick={() => setSearch("")}>×</button>
                )}
            </div>
            <div className="explorer-tree">
                {filtered.length === 0 && <div className="explorer-empty">No elements found</div>}
                {filtered.map((el) => (
                    <TreeItem
                        key={el.id}
                        element={el}
                        depth={0}
                        selection={selection}
                        onClick={handleClick}
                        onContext={handleContext}
                        renaming={renaming}
                        renameVal={renameVal}
                        setRenameVal={setRenameVal}
                        onRenameSubmit={handleRenameSubmit}
                        renameInputRef={renameInputRef}
                        searchTerm={search.toLowerCase()}
                    />
                ))}
            </div>

            {ctx && (
                <div
                    ref={ctxRef}
                    className="context-menu"
                    style={{ top: ctx.y, left: ctx.x }}
                >
                    <button className="context-item" onClick={() => {
                        onSelectionChange(new Set([ctx.element.id]));
                        setCtx(null);
                    }}>
                        <span className="ctx-icon">🎯</span> Select
                    </button>
                    {ctx.element.type === "cluster" && ctx.element.children && (
                        <button className="context-item" onClick={() => {
                            const ids = collectIds(ctx.element);
                            onSelectionChange(new Set(ids));
                            setCtx(null);
                        }}>
                            <span className="ctx-icon">📦</span> Select All Children
                        </button>
                    )}
                    <div className="context-sep" />
                    {ctx.element.type === "node" && (
                        <button className="context-item" onClick={() => {
                            setRenaming(ctx.element.id);
                            setRenameVal(ctx.element.id);
                            setCtx(null);
                        }}>
                            <span className="ctx-icon">✏️</span> Rename
                        </button>
                    )}
                    <button className="context-item danger" onClick={() => {
                        onDelete([ctx.element.id]);
                        setCtx(null);
                    }}>
                        <span className="ctx-icon">🗑</span> Delete
                    </button>
                </div>
            )}
        </div>
    );
}

function TreeItem({
    element, depth, selection, onClick, onContext, renaming, renameVal, setRenameVal,
    onRenameSubmit, renameInputRef, searchTerm,
}: {
    element: GraphElement;
    depth: number;
    selection: Set<string>;
    onClick: (id: string, e: React.MouseEvent) => void;
    onContext: (e: React.MouseEvent, el: GraphElement) => void;
    renaming: string | null;
    renameVal: string;
    setRenameVal: (v: string) => void;
    onRenameSubmit: () => void;
    renameInputRef: React.RefObject<HTMLInputElement | null>;
    searchTerm: string;
}) {
    const [expanded, setExpanded] = useState(true);
    const hasChildren = element.children && element.children.length > 0;
    const isSelected = selection.has(element.id);
    const isRenaming = renaming === element.id;

    const icon = element.type === "cluster" ? "📦"
        : element.type === "edge" ? "→"
            : element.type === "graph" ? "◇" : "⬡";

    const typeClass = `explorer-type-${element.type}`;

    return (
        <div>
            <div
                className={`explorer-item ${isSelected ? "selected" : ""} ${typeClass}`}
                style={{ paddingLeft: `${8 + depth * 16}px` }}
                onClick={(e) => { e.stopPropagation(); onClick(element.id, e); }}
                onContextMenu={(e) => onContext(e, element)}
            >
                {hasChildren ? (
                    <button
                        className="explorer-toggle"
                        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                    >
                        {expanded ? "▾" : "▸"}
                    </button>
                ) : (
                    <span className="explorer-toggle-spacer" />
                )}
                <span className="explorer-icon">{icon}</span>
                {isRenaming ? (
                    <input
                        ref={renameInputRef}
                        className="explorer-rename-input"
                        value={renameVal}
                        onChange={(e) => setRenameVal(e.target.value)}
                        onBlur={onRenameSubmit}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") onRenameSubmit();
                            if (e.key === "Escape") { setRenameVal(""); onRenameSubmit(); }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        spellCheck={false}
                    />
                ) : (
                    <span className="explorer-label" title={element.id}>
                        {highlightMatch(element.label || element.id, searchTerm)}
                    </span>
                )}
            </div>
            {hasChildren && expanded && element.children!.map((child) => (
                <TreeItem
                    key={child.id}
                    element={child}
                    depth={depth + 1}
                    selection={selection}
                    onClick={onClick}
                    onContext={onContext}
                    renaming={renaming}
                    renameVal={renameVal}
                    setRenameVal={setRenameVal}
                    onRenameSubmit={onRenameSubmit}
                    renameInputRef={renameInputRef}
                    searchTerm={searchTerm}
                />
            ))}
        </div>
    );
}

function highlightMatch(text: string, term: string): React.ReactNode {
    if (!term) return text;
    const idx = text.toLowerCase().indexOf(term);
    if (idx === -1) return text;
    return (
        <>
            {text.slice(0, idx)}
            <mark className="explorer-match">{text.slice(idx, idx + term.length)}</mark>
            {text.slice(idx + term.length)}
        </>
    );
}

function filterElements(elements: GraphElement[], term: string): GraphElement[] {
    return elements.reduce<GraphElement[]>((acc, el) => {
        const match = (el.label || el.id).toLowerCase().includes(term);
        const childMatches = el.children ? filterElements(el.children, term) : [];
        if (match || childMatches.length > 0) {
            acc.push({ ...el, children: match ? el.children : childMatches });
        }
        return acc;
    }, []);
}

function collectIds(el: GraphElement): string[] {
    const ids = [el.id];
    el.children?.forEach((c) => ids.push(...collectIds(c)));
    return ids;
}

function countElements(els: GraphElement[]): number {
    let n = els.length;
    els.forEach((e) => { if (e.children) n += countElements(e.children); });
    return n;
}
