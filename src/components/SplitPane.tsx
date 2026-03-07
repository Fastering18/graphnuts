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
        const isVertical = window.innerWidth <= 768;

        const onMove = (e: MouseEvent) => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            let r;
            if (isVertical) {
                r = Math.max(0.15, Math.min(0.85, (e.clientY - rect.top) / rect.height));
            } else {
                r = Math.max(0.15, Math.min(0.85, (e.clientX - rect.left) / rect.width));
            }
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
        <div
            className="split-pane"
            ref={containerRef}
            style={{
                "--split-ratio": ratio,
                ...(dragging ? { userSelect: "none" } : {})
            } as React.CSSProperties}
        >
            <div className="split-pane-left">{left}</div>
            <div className={`split-divider ${dragging ? "dragging" : ""}`} onMouseDown={onMouseDown} />
            <div className="split-pane-right">{right}</div>
        </div>
    );
}
