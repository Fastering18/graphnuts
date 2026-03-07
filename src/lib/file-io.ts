import { jsPDF } from "jspdf";

export function downloadText(content: string, filename: string) {
    const blob = new Blob([content], { type: "text/plain" });
    triggerDownload(blob, filename);
}

export function downloadSvg(svgEl: SVGSVGElement, filename: string) {
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgEl);
    const blob = new Blob([svgStr], { type: "image/svg+xml" });
    triggerDownload(blob, filename);
}

export async function downloadImage(
    svgEl: SVGSVGElement,
    filename: string,
    format: "png" | "jpg"
) {
    const canvas = await svgToCanvas(svgEl);
    const mime = format === "png" ? "image/png" : "image/jpeg";
    canvas.toBlob((blob) => {
        if (blob) triggerDownload(blob, filename);
    }, mime, 0.95);
}

export async function downloadPdf(svgEl: SVGSVGElement, filename: string) {
    const canvas = await svgToCanvas(svgEl);
    const imgData = canvas.toDataURL("image/png");
    const w = canvas.width;
    const h = canvas.height;
    const orientation = w > h ? "landscape" : "portrait";
    const pdf = new jsPDF({ orientation, unit: "px", format: [w, h] });
    pdf.addImage(imgData, "PNG", 0, 0, w, h);
    pdf.save(filename);
}

export async function loadFile(): Promise<{ name: string; content: string } | null> {
    return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".gn,.dot,.gv";
        input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return resolve(null);
            const reader = new FileReader();
            reader.onload = () => resolve({ name: file.name, content: reader.result as string });
            reader.readAsText(file);
        };
        input.click();
    });
}

function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

async function svgToCanvas(svgEl: SVGSVGElement): Promise<HTMLCanvasElement> {
    const serializer = new XMLSerializer();
    let svgStr = serializer.serializeToString(svgEl);

    const bbox = svgEl.getBBox();
    const w = Math.ceil(bbox.width + bbox.x * 2) || 1200;
    const h = Math.ceil(bbox.height + bbox.y * 2) || 800;

    svgStr = svgStr.replace(
        /^<svg/,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"`
    );

    const img = new Image();
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    return new Promise((resolve, reject) => {
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = w * 2;
            canvas.height = h * 2;
            const ctx = canvas.getContext("2d")!;
            ctx.scale(2, 2);
            ctx.fillStyle = "#0a0a0f";
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            URL.revokeObjectURL(url);
            resolve(canvas);
        };
        img.onerror = reject;
        img.src = url;
    });
}
