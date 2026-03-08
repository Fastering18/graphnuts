"use client";

import { useSession, signIn } from "next-auth/react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ProfilePage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    // Redirect to login if unauthenticated
    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login");
        }
    }, [status, router]);

    // Fetch deep profile details from Convex matching NextAuth Session string
    const profileOpts = session?.user?.id ? { id: session.user.id } : "skip";
    const profileData = useQuery(api.users.getProfileDetails, profileOpts);

    if (status === "loading" || profileOpts === "skip" || profileData === undefined) {
        return (
            <div className="landing" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
                <div style={{ color: "var(--text-muted)" }}>Loading profile...</div>
            </div>
        );
    }

    if (!profileData) {
        return (
            <div className="landing" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
                <div style={{ color: "var(--danger)" }}>Failed to load profile data.</div>
            </div>
        );
    }

    return (
        <div className="landing" style={{ minHeight: "100vh", paddingBottom: 60 }}>
            <div className="landing-bg" />

            {/* Navigation Bar */}
            <div style={{ position: "absolute", top: 20, left: 20, zIndex: 10 }}>
                <Link href="/" className="btn btn-secondary" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span>←</span> Back to Dashboard
                </Link>
            </div>

            <div className="landing-content" style={{ marginTop: 80, alignItems: "center" }}>
                <div style={{ width: "100%", maxWidth: 640, background: "var(--bg-secondary)", borderRadius: 16, border: "1px solid var(--border)", boxShadow: "0 20px 40px rgba(0,0,0,0.5)", overflow: "hidden" }}>

                    {/* Header Strip */}
                    <div style={{ background: "var(--bg-tertiary)", padding: "32px 40px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-end", gap: 24 }}>
                        <img
                            src={profileData.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(profileData.name || profileData.email || "U")}&background=random&size=128`}
                            alt="Profile Avatar"
                            style={{ width: 100, height: 100, borderRadius: "50%", border: "4px solid var(--bg-secondary)", boxShadow: "0 4px 12px rgba(0,0,0,0.2)", objectFit: "cover", background: "var(--bg-secondary)" }}
                        />
                        <div style={{ paddingBottom: 8 }}>
                            <h1 style={{ margin: "0 0 8px 0", fontSize: 28, color: "var(--text-primary)" }}>{profileData.name || "Anonymous User"}</h1>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{profileData.email || "No email provided"}</span>
                                <span style={{ fontSize: 11, padding: "2px 8px", background: "var(--accent-glow)", color: "var(--accent)", borderRadius: 12, border: "1px solid var(--accent)", textTransform: "uppercase", fontWeight: "bold" }}>{profileData.role}</span>
                            </div>
                        </div>
                    </div>

                    {/* Content Body */}
                    <div style={{ padding: "40px" }}>
                        <h3 style={{ margin: "0 0 20px 0", fontSize: 18, color: "var(--text-primary)", borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>Account Security</h3>

                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", marginBottom: 4 }}>Password Authentication</div>
                                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                                        {profileData.hasPassword ? "••••••••" : "Not set (Managed by OAuth provider)"}
                                    </div>
                                </div>
                                <div style={{ fontSize: 12, padding: "4px 12px", background: "var(--bg-tertiary)", color: "var(--text-muted)", borderRadius: 16, border: "1px solid var(--border)" }}>
                                    {profileData.hasPassword ? "Active" : "Inactive"}
                                </div>
                            </div>

                            <div style={{ height: 1, background: "var(--border)", margin: "8px 0" }} />

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", marginBottom: 4 }}>GitHub Connection</div>
                                    <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Link a verified GitHub identity to this account</div>
                                </div>
                                {profileData.githubId ? (
                                    <div style={{ fontSize: 12, padding: "4px 12px", background: "rgba(16, 185, 129, 0.1)", color: "#10b981", borderRadius: 16, border: "1px solid rgba(16, 185, 129, 0.3)", display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                                        <span>✓</span> Connected
                                    </div>
                                ) : (
                                    <button
                                        className="btn btn-secondary"
                                        style={{ display: "flex", alignItems: "center", gap: 8 }}
                                        onClick={() => signIn("github", { callbackUrl: "/profile" })}
                                    >
                                        <svg height="16" viewBox="0 0 16 16" width="16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path></svg>
                                        Connect GitHub
                                    </button>
                                )}
                            </div>
                        </div>

                        <h3 style={{ margin: "40px 0 20px 0", fontSize: 18, color: "var(--text-primary)", borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>Platform Data</h3>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                            <div style={{ background: "var(--bg-tertiary)", padding: 20, borderRadius: 12, border: "1px solid var(--border)" }}>
                                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Diagrams Owned</div>
                                <div style={{ fontSize: 32, fontWeight: "bold", color: "var(--text-primary)" }}>{profileData.graphCount}</div>
                            </div>
                            <div style={{ background: "var(--bg-tertiary)", padding: 20, borderRadius: 12, border: "1px solid var(--border)" }}>
                                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Member Since</div>
                                <div style={{ fontSize: 16, fontWeight: 500, color: "var(--text-primary)", marginTop: 12 }}>
                                    {new Date(profileData.createdAt).toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' })}
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}
