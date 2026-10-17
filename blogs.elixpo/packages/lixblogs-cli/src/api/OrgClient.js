import { BlogApiError } from "./BlogClient.js";

async function parseResponse(response) {
    let payload;
    try {
        payload = await response.json();
    } catch {
        payload = null;
    }
    if (!response.ok || payload?.error) {
        throw new BlogApiError(
            payload?.error?.code || `http_${response.status}`,
            payload?.error?.message ||
                `LixBlogs returned HTTP ${response.status}.`,
            {
                status: response.status,
                requestId:
                    payload?.error?.requestId ||
                    response.headers.get("x-request-id"),
                details: payload?.error?.details,
            },
        );
    }
    return { payload, etag: response.headers.get("etag") };
}

export class OrgClient {
    constructor(
        authenticatedClient,
        {
            sleep = (milliseconds) =>
                new Promise((resolve) => setTimeout(resolve, milliseconds)),
        } = {},
    ) {
        this.http = authenticatedClient;
        this.sleep = sleep;
    }

    async request(path, options = {}) {
        const requestOptions = {
            ...options,
            headers: {
                accept: "application/json",
                ...(options.body ? { "content-type": "application/json" } : {}),
                ...options.headers,
            },
        };
        const method = requestOptions.method || "GET";
        const retryable = method === "GET";
        for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
                const response = await this.http.request(path, requestOptions);
                if (
                    retryable &&
                    attempt === 0 &&
                    (response.status === 429 || response.status >= 500)
                ) {
                    const seconds = Math.min(
                        2,
                        Number.parseInt(
                            response.headers.get("retry-after") || "1",
                            10,
                        ) || 1,
                    );
                    await this.sleep(seconds * 1000);
                    continue;
                }
                return parseResponse(response);
            } catch (error) {
                if (
                    !retryable ||
                    attempt > 0 ||
                    error instanceof BlogApiError ||
                    error?.code
                )
                    throw error;
                await this.sleep(250);
            }
        }
        throw new BlogApiError(
            "request_failed",
            "The LixBlogs request failed after retrying.",
        );
    }

    async requireScopes(scopes) {
        if (typeof this.http.requireScopes === "function")
            await this.http.requireScopes(scopes);
    }

    async list() {
        await this.requireScopes(["lixblogs:organizations:read"]);
        return (await this.request("/api/v1/orgs")).payload;
    }

    async get(id) {
        if (!id) throw new Error("An organization ID or handle is required.");
        await this.requireScopes(["lixblogs:organizations:read"]);
        return (await this.request(`/api/v1/orgs/${encodeURIComponent(id)}`))
            .payload.data;
    }

    async collections(id) {
        if (!id) throw new Error("An organization ID or handle is required.");
        await this.requireScopes(["lixblogs:organizations:read"]);
        return (
            await this.request(
                `/api/v1/orgs/${encodeURIComponent(id)}/collections`,
            )
        ).payload.data;
    }

    async members(id) {
        if (!id) throw new Error("An organization ID or handle is required.");
        await this.requireScopes(["lixblogs:organizations:read"]);
        return (
            await this.request(`/api/v1/orgs/${encodeURIComponent(id)}/members`)
        ).payload.data;
    }

    async targets() {
        await this.requireScopes(["lixblogs:organizations:read"]);
        const orgsList = await this.list();
        const orgs = orgsList?.data || [];
        const writableOrgs = orgs.filter((org) => org.canWrite);

        const orgTargets = await Promise.all(
            writableOrgs.map(async (org) => {
                let cols = [];
                try {
                    cols = await this.collections(org.id);
                } catch {
                    cols = [];
                }
                return {
                    target: `org:${org.id}`,
                    orgId: org.id,
                    slug: org.slug,
                    name: org.name,
                    role: org.role,
                    collections: cols.map((col) => ({
                        id: col.id,
                        slug: col.slug,
                        name: col.name,
                    })),
                };
            }),
        );

        return {
            personal: {
                target: "personal",
                name: "Personal Blog",
            },
            organizations: orgTargets,
        };
    }
}
