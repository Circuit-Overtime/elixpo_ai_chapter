export const runtime = "edge";

import { getSession } from "@/lib/session";
import { type NextRequest, NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
    const session = await getSession(request);
    if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        if (!file) {
            return NextResponse.json({ ok: false, error: "No file uploaded." }, { status: 400 });
        }

        const text = await file.text();
        const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
        if (lines.length === 0) {
            return NextResponse.json({ ok: false, error: "File is empty." }, { status: 400 });
        }

        const parseLine = (line: string) => {
            const result = [];
            let cur = "";
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (inQuotes) {
                    if (char === '"') {
                        if (i + 1 < line.length && line[i + 1] === '"') {
                            cur += '"';
                            i++;
                        } else {
                            inQuotes = false;
                        }
                    } else {
                        cur += char;
                    }
                } else {
                    if (char === '"') {
                        inQuotes = true;
                    } else if (char === ",") {
                        result.push(cur);
                        cur = "";
                    } else {
                        cur += char;
                    }
                }
            }
            result.push(cur);
            return result;
        };

        const headers = parseLine(lines[0]).map((h) => h.trim().toLowerCase());
        const emailIndex = headers.indexOf("email");

        if (emailIndex === -1) {
            return NextResponse.json(
                { ok: false, error: "CSV must contain an 'email' column." },
                { status: 400 },
            );
        }

        const validRecipientsMap = new Map<string, Record<string, string>>();
        const malformedRows: { row: number; error: string }[] = [];

        for (let i = 1; i < lines.length; i++) {
            const values = parseLine(lines[i]);
            const email = values[emailIndex]?.trim().toLowerCase();

            if (!email) {
                malformedRows.push({ row: i + 1, error: "Missing email address" });
                continue;
            }

            if (!EMAIL_RE.test(email)) {
                malformedRows.push({ row: i + 1, error: `Invalid email format: ${email}` });
                continue;
            }

            if (!validRecipientsMap.has(email)) {
                const vars: Record<string, string> = {};
                for (let j = 0; j < headers.length; j++) {
                    if (j === emailIndex) continue;
                    const header = headers[j];
                    if (header && values[j] !== undefined) {
                        vars[header] = values[j].trim();
                    }
                }
                validRecipientsMap.set(email, vars);
            }
        }

        const validRecipients = Array.from(validRecipientsMap.entries()).map(([email, vars]) => ({
            email,
            vars,
        }));

        return NextResponse.json({
            ok: true,
            validRecipients, // Deduplicated array of { email, vars }
            malformedRows,
            totalRows: lines.length - 1,
        });
    } catch (e: any) {
        return NextResponse.json(
            { ok: false, error: `Parse error: ${e.message || e}` },
            { status: 500 },
        );
    }
}
