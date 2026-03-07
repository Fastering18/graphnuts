import { instance as vizInstance } from "@viz-js/viz";

let viz: Awaited<ReturnType<typeof vizInstance>> | null = null;

export async function getViz() {
  if (!viz) viz = await vizInstance();
  return viz;
}

export type Engine = "dot" | "neato" | "fdp" | "sfdp" | "circo" | "twopi";

export async function renderDot(
  dot: string,
  engine: Engine = "dot"
): Promise<string> {
  const v = await getViz();
  try {
    return v.renderString(dot, { format: "svg", engine });
  } catch (e: unknown) {
    throw new Error(e instanceof Error ? e.message : String(e));
  }
}
