import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Grafnuts — Interactive Graph Editor",
  description: "Render and edit Graphviz diagrams interactively. Drag nodes, edit code, auto-layout, and export to SVG/PNG/PDF.",
  keywords: ["graphviz", "diagram", "editor", "interactive", "graph"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.variable}>{children}</body>
    </html>
  );
}
