/**
 * {{variable}} handling for templates. Variables are simple dotted identifiers
 * inside double braces, e.g. {{name}} or {{order.total}}. Used to (1) discover
 * which variables a template declares and (2) substitute values at send time.
 */

const VAR_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/** Distinct variable names found across the given strings (subject, HTML, …). */
export function extractVariables(...sources: Array<string | null | undefined>): string[] {
    const set = new Set<string>();
    for (const s of sources) {
        if (!s) continue;
        VAR_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = VAR_RE.exec(s)) !== null) set.add(m[1]);
    }
    return [...set];
}

function resolvePath(obj: Record<string, any>, path: string): any {
    return path.split(".").reduce<any>((o, p) => (o == null ? undefined : o[p]), obj);
}

/** Replace {{var}} occurrences in `text` with values from `vars` (missing → ""). */
export function substituteVariables(text: string, vars: Record<string, any>): string {
    return text.replace(VAR_RE, (_full, key: string) => {
        const v = resolvePath(vars, key);
        return v == null ? "" : String(v);
    });
}
