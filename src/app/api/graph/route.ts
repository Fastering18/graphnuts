import { NextResponse } from "next/server";

// Stub API routes for future server-side graph persistence

export async function GET() {
    return NextResponse.json({ message: "Graph API - not yet implemented" }, { status: 501 });
}

export async function POST() {
    return NextResponse.json({ message: "Save graph - not yet implemented" }, { status: 501 });
}
