"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function LoginForm() {
    const searchParams = useSearchParams();
    const [action, setAction] = useState<"login" | "register">("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [error, setError] = useState<string | null>(searchParams.get("error") ? "Authentication failed" : null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const res = await signIn("credentials", {
            email,
            password,
            action,
            name: action === "register" ? name : undefined,
            redirect: true,
            callbackUrl: "/"
        });

        const response = res as any;
        if (response?.error) {
            setError(response.error);
            setLoading(false);
        }
    };

    return (
        <div className="canvas-container" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", position: "relative" }}>
            <div style={{ width: "100%", maxWidth: 440, padding: 32, background: "var(--bg-secondary)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow)", zIndex: 10 }}>
                <div style={{ textAlign: "center", marginBottom: 32 }}>
                    <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8, color: "var(--text-primary)", letterSpacing: "-0.5px" }}>Grafnuts</h1>
                    <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>
                        {action === "login" ? "Sign in to your account" : "Create a new account"}
                    </p>
                </div>

                {error && (
                    <div style={{ marginBottom: 20, padding: "12px 16px", background: "rgba(255, 71, 87, 0.1)", border: "1px solid rgba(255, 71, 87, 0.3)", color: "var(--danger)", borderRadius: "var(--radius)", fontSize: 14, textAlign: "center" }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {action === "register" && (
                        <div>
                            <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>Name</label>
                            <input
                                type="text"
                                required={action === "register"}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                style={{ width: "100%", background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 14px", color: "var(--text-primary)", outline: "none", fontSize: 14 }}
                                placeholder="John Doe"
                            />
                        </div>
                    )}
                    <div>
                        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>Email</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            style={{ width: "100%", background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 14px", color: "var(--text-primary)", outline: "none", fontSize: 14 }}
                            placeholder="user@example.com"
                        />
                    </div>
                    <div>
                        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 }}>Password</label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            style={{ width: "100%", background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 14px", color: "var(--text-primary)", outline: "none", fontSize: 14 }}
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn btn-primary"
                        style={{ width: "100%", justifyContent: "center", marginTop: 8, padding: 12, opacity: loading ? 0.7 : 1 }}
                    >
                        {loading ? "Please wait..." : action === "login" ? "Sign In" : "Register"}
                    </button>
                </form>

                <div style={{ marginTop: 24, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                    <span>{action === "login" ? "Don't have an account?" : "Already have an account?"}</span>
                    <button
                        onClick={() => { setAction(action === "login" ? "register" : "login"); setError(null); }}
                        style={{ background: "none", border: "none", color: "var(--accent)", fontWeight: 500, cursor: "pointer", padding: 0 }}
                    >
                        {action === "login" ? "Register" : "Sign In"}
                    </button>
                </div>

                <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 12 }}>
                    <button
                        onClick={() => signIn("github", { callbackUrl: "/" })}
                        className="btn btn-secondary"
                        style={{ width: "100%", justifyContent: "center", gap: 8 }}
                    >
                        <svg className="w-5 h-5" style={{ width: 18, height: 18, fill: "currentColor" }} viewBox="0 0 24 24">
                            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                        </svg>
                        Continue with GitHub
                    </button>
                </div>
            </div>

            <div style={{ marginTop: 32, zIndex: 10 }}>
                <Link href="/" style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "none" }}>
                    ← Back to Sandbox
                </Link>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div className="canvas-container" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>Loading...</div>}>
            <LoginForm />
        </Suspense>
    );
}
