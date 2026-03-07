"use client";

const SHORTCUTS = [
    { keys: "V", desc: "Select mode" },
    { keys: "H", desc: "Pan mode" },
    { keys: "C", desc: "Center view" },
    { keys: "Click", desc: "Select node / edge / cluster" },
    { keys: "Shift + Click", desc: "Add to selection" },
    { keys: "Ctrl + Click", desc: "Toggle selection" },
    { keys: "Drag (select mode)", desc: "Rubber-band select" },
    { keys: "Ctrl + A", desc: "Select all nodes" },
    { keys: "Escape", desc: "Clear selection" },
    { keys: "Delete / Backspace", desc: "Delete selected" },
    { keys: "Ctrl + S", desc: "Save file (.gn)" },
    { keys: "Ctrl + E", desc: "Toggle explorer" },
    { keys: "Ctrl + Z", desc: "Undo (in editor)" },
    { keys: "Ctrl + Shift + Z", desc: "Redo (in editor)" },
    { keys: "Scroll wheel", desc: "Zoom canvas" },
    { keys: "Right-click edge", desc: "Edge style menu" },
    { keys: "?", desc: "Toggle this help" },
];

interface Props { open: boolean; onClose: () => void; }

export default function HelpModal({ open, onClose }: Props) {
    if (!open) return null;
    return (
        <div className="help-overlay" onClick={onClose}>
            <div className="help-modal" onClick={(e) => e.stopPropagation()}>
                <div className="help-header">
                    <h2>Keyboard Shortcuts</h2>
                    <button className="btn btn-icon" onClick={onClose}>✕</button>
                </div>
                <div className="help-body">
                    {SHORTCUTS.map((s) => (
                        <div key={s.keys} className="help-row">
                            <kbd className="help-key">{s.keys}</kbd>
                            <span className="help-desc">{s.desc}</span>
                        </div>
                    ))}
                </div>
                <div className="help-footer">Press <kbd>?</kbd> to toggle</div>
            </div>
        </div>
    );
}
