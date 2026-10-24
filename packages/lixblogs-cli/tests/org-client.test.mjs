import assert from "node:assert/strict";
import test from "node:test";
import { BlogApiError } from "../src/api/BlogClient.js";
import { OrgClient } from "../src/api/OrgClient.js";

function response(body, status = 200, headers = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", ...headers },
    });
}

test("OrgClient.list requires lixblogs:organizations:read scope and calls /api/v1/orgs", async () => {
    let requiredScope;
    let requestedUrl;
    const client = new OrgClient({
        requireScopes: async (scopes) => {
            requiredScope = scopes;
        },
        request: async (url) => {
            requestedUrl = url;
            return response({
                data: [
                    {
                        id: "org-1",
                        slug: "engineering",
                        name: "Engineering",
                        role: "admin",
                        canWrite: true,
                    },
                ],
            });
        },
    });

    const result = await client.list();
    assert.deepEqual(requiredScope, ["lixblogs:organizations:read"]);
    assert.equal(requestedUrl, "/api/v1/orgs");
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].slug, "engineering");
});

test("OrgClient.get inspects specific org and requires ID", async () => {
    const client = new OrgClient({
        requireScopes: async () => {},
        request: async (url) => {
            assert.equal(url, "/api/v1/orgs/org-1");
            return response({
                data: { id: "org-1", name: "Engineering", role: "write" },
            });
        },
    });

    await assert.rejects(
        client.get(""),
        /An organization ID or handle is required/,
    );
    const result = await client.get("org-1");
    assert.equal(result.id, "org-1");
    assert.equal(result.name, "Engineering");
});

test("OrgClient.collections and OrgClient.members query subresources", async () => {
    const client = new OrgClient({
        requireScopes: async () => {},
        request: async (url) => {
            if (url.includes("/collections")) {
                return response({
                    data: [
                        {
                            id: "col-1",
                            slug: "architecture",
                            name: "Architecture",
                        },
                    ],
                });
            }
            if (url.includes("/members")) {
                return response({
                    data: [
                        {
                            userId: "user-1",
                            username: "alice",
                            role: "admin",
                            isOwner: true,
                        },
                    ],
                });
            }
            throw new Error(`Unexpected url ${url}`);
        },
    });

    const collections = await client.collections("org-1");
    assert.equal(collections.length, 1);
    assert.equal(collections[0].slug, "architecture");

    const members = await client.members("org-1");
    assert.equal(members.length, 1);
    assert.equal(members[0].username, "alice");
});

test("OrgClient.targets resolves personal target and writable orgs with collections", async () => {
    const client = new OrgClient({
        requireScopes: async () => {},
        request: async (url) => {
            if (url === "/api/v1/orgs") {
                return response({
                    data: [
                        {
                            id: "org-write",
                            slug: "core-team",
                            name: "Core Team",
                            role: "maintain",
                            canWrite: true,
                        },
                        {
                            id: "org-read",
                            slug: "viewers",
                            name: "Viewers Org",
                            role: "read",
                            canWrite: false,
                        },
                    ],
                });
            }
            if (url === "/api/v1/orgs/org-write/collections") {
                return response({
                    data: [
                        {
                            id: "col-1",
                            slug: "announcements",
                            name: "Announcements",
                        },
                    ],
                });
            }
            throw new Error(`Unexpected url ${url}`);
        },
    });

    const targets = await client.targets();
    assert.equal(targets.personal.target, "personal");
    assert.equal(targets.organizations.length, 1);
    assert.equal(targets.organizations[0].target, "org:org-write");
    assert.equal(targets.organizations[0].collections.length, 1);
    assert.equal(targets.organizations[0].collections[0].slug, "announcements");
});

test("OrgClient converts API error envelopes to BlogApiError", async () => {
    const client = new OrgClient({
        requireScopes: async () => {},
        request: async () =>
            response(
                {
                    error: {
                        code: "org_not_found",
                        message: "Organization not found.",
                        requestId: "req-404",
                    },
                },
                404,
            ),
    });

    await assert.rejects(client.get("nonexistent"), (error) => {
        assert.ok(error instanceof BlogApiError);
        assert.equal(error.code, "org_not_found");
        assert.equal(error.status, 404);
        assert.equal(error.requestId, "req-404");
        return true;
    });
});
