import { NextResponse } from "next/server";
import { fetchQuery, fetchMutation } from "convex/nextjs";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "Missing graph ID parameter" }, { status: 400 });

    try {
        const graph = await fetchQuery(api.graphs.getGraph, { id: id as Id<"graphs"> });
        if (!graph) return NextResponse.json({ error: "Graph not found" }, { status: 404 });
        return NextResponse.json({ graph }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch graph" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { id, title, dotSource, isPublic, isPublicEditable } = body;

        if (!id || !title || !dotSource) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        await fetchMutation(api.graphs.saveGraph, {
            id: id as Id<"graphs">,
            title,
            dotSource,
            isPublic: isPublic ?? false,
            isPublicEditable: isPublicEditable ?? false,
        });

        return NextResponse.json({ success: true, message: "Graph saved" }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ error: "Failed to save graph" }, { status: 500 });
    }
}
