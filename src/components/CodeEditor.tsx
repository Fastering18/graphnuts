"use client";

import { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { basicSetup } from "codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { dot as dotLang } from "@viz-js/lang-dot";

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
