"use client";

import { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { basicSetup } from "codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { dot as dotLang } from "@viz-js/lang-dot";
import { autocompletion, CompletionContext } from "@codemirror/autocomplete";

const DOT_KEYWORDS = [
    // Graph-level
    { label: "digraph", type: "keyword", detail: "Directed graph" },
    { label: "graph", type: "keyword", detail: "Undirected graph" },
    { label: "subgraph", type: "keyword", detail: "Subgraph/cluster" },
    { label: "strict", type: "keyword", detail: "No duplicate edges" },
    // Attributes
    { label: "label", type: "property", detail: "Node/edge label" },
    { label: "shape", type: "property", detail: "Node shape" },
    { label: "color", type: "property", detail: "Stroke color" },
    { label: "fillcolor", type: "property", detail: "Fill color" },
    { label: "style", type: "property", detail: "Style (filled, dashed...)" },
    { label: "fontsize", type: "property", detail: "Font size" },
    { label: "fontcolor", type: "property", detail: "Font color" },
    { label: "fontname", type: "property", detail: "Font family" },
    { label: "pos", type: "property", detail: "Node position \"x,y\"" },
    { label: "width", type: "property", detail: "Node width" },
    { label: "height", type: "property", detail: "Node height" },
    { label: "penwidth", type: "property", detail: "Stroke width" },
    // Graph attrs
    { label: "rankdir", type: "property", detail: "TB, LR, BT, RL" },
    { label: "splines", type: "property", detail: "Edge routing mode" },
    { label: "nodesep", type: "property", detail: "Node spacing" },
    { label: "ranksep", type: "property", detail: "Rank spacing" },
    { label: "bgcolor", type: "property", detail: "Background color" },
    { label: "concentrate", type: "property", detail: "Merge edges" },
    // Shapes
    { label: "box", type: "enum", detail: "Rectangle shape" },
    { label: "ellipse", type: "enum", detail: "Ellipse shape" },
    { label: "circle", type: "enum", detail: "Circle shape" },
    { label: "diamond", type: "enum", detail: "Diamond shape" },
    { label: "plaintext", type: "enum", detail: "No border" },
    { label: "record", type: "enum", detail: "Record shape" },
    { label: "parallelogram", type: "enum", detail: "Parallelogram" },
    { label: "doublecircle", type: "enum", detail: "Double circle" },
    // Styles
    { label: "filled", type: "enum", detail: "Filled style" },
    { label: "dashed", type: "enum", detail: "Dashed lines" },
    { label: "dotted", type: "enum", detail: "Dotted lines" },
    { label: "bold", type: "enum", detail: "Bold lines" },
    { label: "rounded", type: "enum", detail: "Rounded corners" },
    { label: "invis", type: "enum", detail: "Invisible" },
    // Spline modes
    { label: "ortho", type: "enum", detail: "Orthogonal edges" },
    { label: "curved", type: "enum", detail: "Curved edges" },
    { label: "polyline", type: "enum", detail: "Polyline edges" },
    // Edge attrs
    { label: "arrowhead", type: "property", detail: "Arrow head style" },
    { label: "arrowtail", type: "property", detail: "Arrow tail style" },
    { label: "dir", type: "property", detail: "Edge direction" },
    { label: "headlabel", type: "property", detail: "Head-side label" },
    { label: "taillabel", type: "property", detail: "Tail-side label" },
    { label: "relpos", type: "property", detail: "Label layout (center, side)" },
];

function dotCompletions(context: CompletionContext) {
    const word = context.matchBefore(/[a-zA-Z_]\w*/);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    return { from: word.from, options: DOT_KEYWORDS, validFor: /^[a-zA-Z_]\w*$/ };
}

export interface CodeEditorHandle {
    scrollToLine: (line: number) => void;
}

interface Props {
    value: string;
    onChange: (val: string) => void;
    readOnly?: boolean;
}

const CodeEditor = forwardRef<CodeEditorHandle, Props>(function CodeEditor({ value, onChange, readOnly = false }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    useImperativeHandle(ref, () => ({
        scrollToLine: (line: number) => {
            const view = viewRef.current;
            if (!view) return;
            const doc = view.state.doc;
            const clampedLine = Math.max(1, Math.min(line, doc.lines));
            const lineInfo = doc.line(clampedLine);
            view.dispatch({
                selection: { anchor: lineInfo.from },
                effects: EditorView.scrollIntoView(lineInfo.from, { y: "center" }),
            });
            view.focus();
        },
    }));

    useEffect(() => {
        if (!containerRef.current) return;
        const state = EditorState.create({
            doc: value,
            extensions: [
                basicSetup,
                oneDark,
                dotLang(),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) onChangeRef.current(update.state.doc.toString());
                }),
                EditorView.theme({
                    "&": { height: "100%", fontSize: "13px" },
                    ".cm-content": { fontFamily: "var(--font-mono)" },
                    ".cm-gutters": {
                        background: "var(--bg-secondary)",
                        borderRight: "1px solid var(--border)",
                        color: "var(--text-muted)",
                    },
                    "&.cm-focused": { outline: "none" },
                    ".cm-activeLine": { backgroundColor: "rgba(108,92,231,0.08)" },
                    ".cm-activeLineGutter": { backgroundColor: "rgba(108,92,231,0.12)" },
                }),
                EditorState.readOnly.of(readOnly),
                EditorView.editable.of(!readOnly),
                autocompletion({ override: [dotCompletions], activateOnTyping: true }),
            ],
        });
        const view = new EditorView({ state, parent: containerRef.current });
        viewRef.current = view;
        return () => { view.destroy(); viewRef.current = null; };
    }, []);

    useEffect(() => {
        const view = viewRef.current;
        if (!view) return;
        const current = view.state.doc.toString();
        if (current !== value) {
            view.dispatch({
                changes: { from: 0, to: current.length, insert: value },
            });
        }
    }, [value]);

    return <div className="editor-container" ref={containerRef} />;
});

export default CodeEditor;
