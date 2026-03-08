function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function patchEdgeStyle(dot, from, to, style) {
    const ef = escapeRegex(from), et = escapeRegex(to);
    // Accommodate quotes that might exist in the DOT code but are stripped by WASM
    const re = new RegExp(`(^[ \\t]*"?(?:${ef})"?[ \\t]*->[ \\t]*"?(?:${et})"?\\s*\\[)([^\\]]*)(\\])`, "m");
    const m = dot.match(re);
    if (m) {
        const attrs = m[2];
        const sp = /style\s*=\s*\w+/;
        const updated = sp.test(attrs) ? attrs.replace(sp, `style=${style}`) : `style=${style} ${attrs}`;
        return dot.replace(re, `$1${updated}$3`);
    }
    const re2 = new RegExp(`(^[ \\t]*"?(?:${ef})"?[ \\t]*->[ \\t]*"?(?:${et})"?)[ \\t]*$`, "m");
    if (dot.match(re2)) return dot.replace(re2, `$1 [style=${style}]`);
    return dot;
}

const dot = `digraph G {
    Client -> API [label=" Web "]
    "Client" -> "API" [color="red"]
    Node A -> Node B
}`;

console.log(patchEdgeStyle(dot, "Client", "API", "dashed"));
console.log(patchEdgeStyle(dot, "Node A", "Node B", "dotted"));
