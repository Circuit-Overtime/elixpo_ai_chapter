export const runtime = "edge";

import { cloudinaryConfig, uploadImage } from "@/lib/cloudinary";
import { getSession } from "@/lib/session";
import { requireWriteRole } from "@/lib/workspace-guard";
import { type NextRequest, NextResponse } from "next/server";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const OK_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"];

/**
 * POST /api/uploads/image — host upload endpoint for the lixeditor `uploadFile`
 * hook. Accepts a multipart `file`, stores it on Cloudinary under
 * mail-elixpo/<tenant>, and returns an optimized delivery URL.
 */
export async function POST(request: NextRequest) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const denied = await requireWriteRole(session);
    if (denied) return denied;

    const cfg = await cloudinaryConfig();
    if (!cfg) {
        return NextResponse.json(
            {
                error: "not_configured",
                message: "Image hosting isn't configured (set CLOUDINARY_*).",
            },
            { status: 501 },
        );
    }

    let form: FormData;
    try {
        form = await request.formData();
    } catch {
        return NextResponse.json({ error: "invalid_form" }, { status: 400 });
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
        return NextResponse.json({ error: "no_file" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
        return NextResponse.json(
            { error: "too_large", message: "Image exceeds the 10 MB limit." },
            { status: 413 },
        );
    }
    if (file.type && !OK_TYPES.includes(file.type)) {
        return NextResponse.json(
            { error: "bad_type", message: "Unsupported image type." },
            { status: 415 },
        );
    }

    try {
        const result = await uploadImage(cfg, file, `mail-elixpo/${session.tenantId}`);
        return NextResponse.json({ ok: true, url: result.url });
    } catch (e: any) {
        return NextResponse.json(
            { error: "upload_failed", message: String(e?.message || e) },
            { status: 502 },
        );
    }
}
