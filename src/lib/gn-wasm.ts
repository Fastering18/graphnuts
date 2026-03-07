let modulePromise: Promise<WasmModule> | null = null;

interface WasmModule {
    _gn_render: (ptr: number) => number;
    _gn_free: () => void;
    _gn_positions: (ptr: number) => number;
    _malloc: (size: number) => number;
    _free: (ptr: number) => void;
    UTF8ToString: (ptr: number) => string;
    stringToUTF8: (str: string, ptr: number, maxBytes: number) => void;
    lengthBytesUTF8: (str: string) => number;
}

function loadModule(): Promise<WasmModule> {
    if (modulePromise) return modulePromise;
    modulePromise = new Promise<WasmModule>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "/wasm/gn_engine.js";
        script.onload = async () => {
            try {
                const factory = (globalThis as any).GnEngine;
                if (!factory) { reject(new Error("GnEngine not found")); return; }
                const mod = await factory();
                resolve(mod as WasmModule);
            } catch (e) { reject(e); }
        };
        script.onerror = () => reject(new Error("Failed to load gn_engine.js"));
        document.head.appendChild(script);
    });
    return modulePromise;
}

export async function gnRender(dotSrc: string): Promise<string> {
    const m = await loadModule();
    const len = m.lengthBytesUTF8(dotSrc) + 1;
    const ptr = m._malloc(len);
    m.stringToUTF8(dotSrc, ptr, len);
    const resultPtr = m._gn_render(ptr);
    const svg = m.UTF8ToString(resultPtr);
    m._free(ptr);
    return svg;
}

export async function gnPositions(dotSrc: string): Promise<Record<string, { x: number; y: number; w: number; h: number }>> {
    const m = await loadModule();
    const len = m.lengthBytesUTF8(dotSrc) + 1;
    const ptr = m._malloc(len);
    m.stringToUTF8(dotSrc, ptr, len);
    const resultPtr = m._gn_positions(ptr);
    const json = m.UTF8ToString(resultPtr);
    m._free(ptr);
    try { return JSON.parse(json); } catch { return {}; }
}

export function gnFree() {
    loadModule().then((m) => m._gn_free()).catch(() => { });
}
