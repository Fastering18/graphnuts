"use client";

import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import { loadFile } from "@/lib/file-io";

const EXAMPLE_DOT = `digraph G {
    graph [rankdir=LR bgcolor="#f0f2f5" fontname="Segoe UI"]
    node [shape=box style="filled,rounded" fillcolor="#ffffff" fontname="Segoe UI"]
    edge [color="#3a7bd5" penwidth=1.8]

    A [label="Start" fillcolor="#3a7bd5" fontcolor="white"]
    B [label="Process"]
    C [label="Decision" shape=diamond fillcolor="#fff5e0"]
    D [label="End" fillcolor="#d94f4f" fontcolor="white"]

    A -> B [label=" step 1"]
    B -> C [label=" check"]
    C -> B [label=" retry" style=dashed]
    C -> D [label=" done"]
}`;

export default function LandingPage() {
  const router = useRouter();

  const handleNew = () => {
    const id = nanoid(8);
    sessionStorage.setItem(`gn_${id}`, EXAMPLE_DOT);
    sessionStorage.setItem(`gn_name_${id}`, "untitled.gn");
    router.push(`/${id}`);
  };

  const handleLoad = async () => {
    const file = await loadFile();
    if (!file) return;
    const id = nanoid(8);
    sessionStorage.setItem(`gn_${id}`, file.content);
    sessionStorage.setItem(`gn_name_${id}`, file.name);
    router.push(`/${id}`);
  };

  return (
    <div className="landing">
      <div className="landing-bg" />
      <div className="landing-content">
        <div className="landing-badge animate-in">✦ Graph Editor</div>

        <h1 className="animate-in animate-delay-1">
          Edit graphs with<br /><span className="gradient">code & canvas</span>
        </h1>

        <p className="landing-subtitle animate-in animate-delay-2">
          Grafnuts renders Graphviz DOT diagrams and lets you drag nodes,
          edit code, auto-layout, and export — all in your browser.
        </p>

        <div className="landing-actions animate-in animate-delay-2">
          <button className="btn btn-primary" onClick={handleNew}>✦ New Graph</button>
          <button className="btn btn-secondary" onClick={handleLoad}>📂 Load File (.gn)</button>
        </div>

        <div className="features">
          {[
            { icon: "⚡", title: "WASM Rendering", desc: "Graphviz compiled to WebAssembly for near-native speed." },
            { icon: "🖱", title: "Drag & Drop", desc: "Move nodes directly on the canvas, code updates automatically." },
            { icon: "✏️", title: "Code Editor", desc: "Full DOT syntax highlighting with CodeMirror 6." },
            { icon: "📐", title: "Auto-Layout", desc: "Tree, grid, circular, snowflake, and force-directed layouts." },
            { icon: "📤", title: "Export", desc: "Download as SVG, PNG, JPG, or PDF with one click." },
            { icon: "🔮", title: "Coming Soon", desc: "Accounts, cloud save, collaboration, and more." },
          ].map((f, i) => (
            <div key={i} className={`feature-card animate-in animate-delay-${Math.min(i + 1, 3)}`}>
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="tutorial animate-in">
          <h2>Quick Start</h2>
          <pre>{`digraph MyGraph {
    A [label="Hello" shape=box]
    B [label="World" shape=ellipse]
    A -> B [label="connects to"]
}`}</pre>
        </div>

        <div className="landing-footer">
          Grafnuts — .gn format • Powered by Graphviz WASM
        </div>
      </div>
    </div>
  );
}
