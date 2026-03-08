import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Grafnuts — Interactive Graph Editor",
  description: "Render and edit Graphviz diagrams interactively. Drag nodes, edit code, auto-layout, save to cloud, and export to SVG/PNG/PDF. Powered by WebAssembly.",
  keywords: ["graphviz", "dot language", "diagram editor", "interactive", "graph", "wasm", "cloud save", "diagramming tool"],
  openGraph: {
    type: "website",
    title: "Grafnuts — Code & Canvas Graph Editor",
    description: "Build, drag, edit, and render Graphviz DOT diagrams instantly. Connects to GitHub for cloud saves.",
    siteName: "Grafnuts",
  },
  twitter: {
    card: "summary_large_image",
    title: "Grafnuts — Interactive WebAssembly Diagram Editor",
    description: "Drag nodes, edit DOT code, auto-layout, and export to SVG instantly in your browser.",
  },
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0",
  icons: {
    icon: "/favicon.ico",
  }
};

import Providers from "@/components/Providers";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
