"use client";

import { useRef, useState, useCallback, type ReactNode } from "react";

interface Props {
    left: ReactNode;
    right: ReactNode;
    defaultRatio?: number;
}

export default function SplitPane({ left, right, defaultRatio = 0.38 }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [ratio, setRatio] = useState(defaultRatio);
    const [dragging, setDragging] = useState(false);

    const onMouseDown = useCallback(() => {
        setDragging(true);
        const onMove = (e: MouseEvent) => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const r = Math.max(0.15, Math.min(0.85, (e.clientX - rect.left) / rect.width));
            setRatio(r);
        };
        const onUp = () => {
            setDragging(false);
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    }, []);

    return (
        <div className="split-pane" ref={containerRef} style={dragging ? { userSelect: "none" } : undefined}>
            <div className="split-pane-left" style={{ width: `${ratio * 100}%` }}>{left}</div>
            <div className={`split-divider ${dragging ? "dragging" : ""}`} onMouseDown={onMouseDown} />
            <div className="split-pane-right" style={{ width: `${(1 - ratio) * 100}%` }}>{right}</div>
        </div>
    );
}
