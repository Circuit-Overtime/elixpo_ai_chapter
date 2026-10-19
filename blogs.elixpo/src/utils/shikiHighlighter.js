const languageLoaders = {
    javascript: () => import("@shikijs/langs/javascript"),
    typescript: () => import("@shikijs/langs/typescript"),
    python: () => import("@shikijs/langs/python"),
    java: () => import("@shikijs/langs/java"),
    c: () => import("@shikijs/langs/c"),
    cpp: () => import("@shikijs/langs/cpp"),
    csharp: () => import("@shikijs/langs/csharp"),
    go: () => import("@shikijs/langs/go"),
    rust: () => import("@shikijs/langs/rust"),
    ruby: () => import("@shikijs/langs/ruby"),
    php: () => import("@shikijs/langs/php"),
    swift: () => import("@shikijs/langs/swift"),
    kotlin: () => import("@shikijs/langs/kotlin"),
    html: () => import("@shikijs/langs/html"),
    css: () => import("@shikijs/langs/css"),
    json: () => import("@shikijs/langs/json"),
    yaml: () => import("@shikijs/langs/yaml"),
    markdown: () => import("@shikijs/langs/markdown"),
    bash: () => import("@shikijs/langs/bash"),
    shell: () => import("@shikijs/langs/shellscript"),
    sql: () => import("@shikijs/langs/sql"),
    graphql: () => import("@shikijs/langs/graphql"),
    jsx: () => import("@shikijs/langs/jsx"),
    tsx: () => import("@shikijs/langs/tsx"),
    vue: () => import("@shikijs/langs/vue"),
    svelte: () => import("@shikijs/langs/svelte"),
    dart: () => import("@shikijs/langs/dart"),
    lua: () => import("@shikijs/langs/lua"),
    r: () => import("@shikijs/langs/r"),
    scala: () => import("@shikijs/langs/scala"),
};

const languageAliases = {
    js: "javascript",
    ts: "typescript",
    py: "python",
    cs: "csharp",
    rs: "rust",
    rb: "ruby",
    kt: "kotlin",
    yml: "yaml",
    md: "markdown",
    sh: "bash",
    shellscript: "shell",
    gql: "graphql",
};

let highlighterPromise;

export function normalizeShikiLanguage(language) {
    const value = String(language || "text").toLowerCase();
    return languageAliases[value] || value;
}

export async function getLixShikiHighlighter() {
    if (!highlighterPromise) {
        highlighterPromise = Promise.all([
            import("shiki/core"),
            import("shiki/engine/javascript"),
            import("@shikijs/themes/vitesse-dark"),
            import("@shikijs/themes/vitesse-light"),
        ]).then(async ([core, engine, darkTheme, lightTheme]) => {
            const highlighter = await core.createHighlighterCore({
                themes: [darkTheme.default, lightTheme.default],
                langs: [],
                // The JavaScript engine avoids retaining the Oniguruma WASM
                // runtime for the lifetime of every editor tab.
                engine: engine.createJavaScriptRegexEngine(),
            });
            const loadLanguage = highlighter.loadLanguage.bind(highlighter);
            const requestedLanguages = new Set();
            let loadTail = Promise.resolve();

            // BlockNote loads languages by string. A core highlighter expects
            // registrations, so resolve only the grammar that was requested.
            highlighter.loadLanguage = (...languages) => {
                const task = loadTail.then(async () => {
                    const registrations = [];
                    const loadedNames = [];
                    for (const language of languages.flat()) {
                        if (typeof language !== "string") {
                            registrations.push(language);
                            continue;
                        }
                        const normalized = normalizeShikiLanguage(language);
                        if (requestedLanguages.has(normalized)) continue;
                        const loader = languageLoaders[normalized];
                        if (!loader) continue;
                        const module = await loader();
                        registrations.push(...module.default);
                        loadedNames.push(normalized);
                    }
                    if (registrations.length) {
                        await loadLanguage(...registrations);
                        loadedNames.forEach((name) =>
                            requestedLanguages.add(name),
                        );
                    }
                });
                loadTail = task.catch(() => {});
                return task;
            };

            return highlighter;
        });
    }
    return highlighterPromise;
}
