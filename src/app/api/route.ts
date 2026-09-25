import { NextResponse } from "next/server";

// No public root API surface. The application starts at /connexion (per
// the design brief: no landing page, no public homepage, no public
// registration). Returns 404 to avoid advertising that an API exists.
export async function GET() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
