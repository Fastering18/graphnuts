"use client";

import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import { loadFile } from "@/lib/file-io";
import { useSession, signIn, signOut } from "next-auth/react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

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
  const { data: session, status } = useSession();
  const graphs = useQuery(api.graphs.getGraphs, { userId: session?.user?.id });
  const createGraph = useMutation(api.graphs.saveGraph);
  const deleteGraph = useMutation(api.graphs.deleteGraph);

  const handleNew = async () => {
    if (session?.user?.id) {
      // Create in Convex
      const id = await createGraph({
        userId: session.user.id,
        title: "untitled.gn",
        dotSource: EXAMPLE_DOT,
        isPublic: false,
      });
      router.push(`/${id}`);
    } else {
      // Local fallback
      const id = nanoid(8);
      sessionStorage.setItem(`gn_${id}`, EXAMPLE_DOT);
      sessionStorage.setItem(`gn_name_${id}`, "untitled.gn");
      router.push(`/${id}`);
    }
  };

  const handleLoad = async () => {
    const file = await loadFile();
    if (!file) return;

    if (session?.user?.id) {
      const id = await createGraph({
        userId: session.user.id,
        title: file.name,
        dotSource: file.content,
        isPublic: false,
      });
      router.push(`/${id}`);
    } else {
      const id = nanoid(8);
      sessionStorage.setItem(`gn_${id}`, file.content);
      sessionStorage.setItem(`gn_name_${id}`, file.name);
      router.push(`/${id}`);
    }
  };

  const handleDelete = async (id: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Delete this graph?")) {
      await deleteGraph({ id });
    }
  };

  return (
    <div className="landing">
      <div className="landing-bg" />

      {/* Auth Bar */}
      <div style={{ position: "absolute", top: 20, right: 20, zIndex: 10 }}>
        {status === "loading" ? (
          <div style={{ color: "#888" }}>Loading...</div>
        ) : session ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 14 }}>{session.user?.name} ({(session.user as any)?.role})</span>
            {session.user?.image && <img src={session.user.image} alt="" style={{ width: 32, height: 32, borderRadius: "50%" }} />}
            <button className="btn btn-secondary" onClick={() => signOut()}>Sign Out</button>
          </div>
        ) : (
          <Link href="/login" className="btn btn-primary">Sign In</Link>
        )}
      </div>

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

        {session && (
          <div className="dashboard-section animate-in animate-delay-3" style={{ marginTop: 60, width: "100%", maxWidth: 800 }}>
            <h2 style={{ marginBottom: 20, borderBottom: "1px solid #333", paddingBottom: 10 }}>Your Library</h2>
            {graphs === undefined ? (
              <p style={{ color: "#888" }}>Loading graphs...</p>
            ) : graphs.length === 0 ? (
              <p style={{ color: "#888", fontStyle: "italic" }}>No graphs saved yet. Create one above!</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
                {graphs.map(g => (
                  <div key={g._id}
                    style={{ background: "#1a1a24", border: "1px solid #333", borderRadius: 8, padding: 16, cursor: "pointer", position: "relative" }}
                    onClick={() => router.push(`/${g._id}`)}>
                    <h3 style={{ margin: "0 0 8px 0", fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.title}</h3>
                    <p style={{ fontSize: 12, color: "#888", margin: 0 }}>
                      {new Date(g._creationTime).toLocaleDateString()}
                    </p>
                    <button
                      onClick={(e) => handleDelete(g._id, e)}
                      style={{ position: "absolute", top: 12, right: 12, background: "transparent", border: "none", color: "#d94f4f", cursor: "pointer", padding: 4 }}
                      title="Delete">
                      🗑
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!session && (
          <div className="features" style={{ marginTop: 60 }}>
            {[
              { icon: "⚡", title: "WASM Rendering", desc: "Graphviz compiled to WebAssembly for near-native speed." },
              { icon: "🖱", title: "Drag & Drop", desc: "Move nodes directly on the canvas, code updates automatically." },
              { icon: "✏️", title: "Code Editor", desc: "Full DOT syntax highlighting with CodeMirror 6." },
              { icon: "📐", title: "Auto-Layout", desc: "Tree, grid, circular, snowflake, and force-directed layouts." },
              { icon: "📤", title: "Export", desc: "Download as SVG, PNG, JPG, or PDF with one click." },
              { icon: "☁️", title: "Cloud Save", desc: "Log in to save and manage your diagrams across devices." },
            ].map((f, i) => (
              <div key={i} className={`feature-card animate-in animate-delay-${Math.min(i + 1, 3)}`}>
                <div className="feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
