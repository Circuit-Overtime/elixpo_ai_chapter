import assert from "node:assert/strict";
import test from "node:test";
import { isBlogOwner, requirePublishTarget } from "../lib/api/v1/blogInput.js";

test("personal publishing target resolves without collection", async () => {
    const db = {
        prepare() {
            throw new Error(
                "Database should not be queried for personal target",
            );
        },
    };
    const target = await requirePublishTarget(db, "user-1", "personal", null);
    assert.deepEqual(target, { publishedAs: "personal", collectionId: null });
});

test("organization publishing target requires admin, maintain, or write role", async () => {
    const mockDb = (membershipRole, isOwner = false) => ({
        prepare(sql) {
            return {
                bind(_orgId, _userId) {
                    return {
                        async first() {
                            if (sql.includes("org_members")) {
                                if (
                                    ["admin", "maintain", "write"].includes(
                                        membershipRole,
                                    )
                                ) {
                                    return { ok: 1 };
                                }
                                return null;
                            }
                            if (
                                sql.includes(
                                    "orgs WHERE id = ? AND owner_id = ?",
                                )
                            ) {
                                return isOwner ? { ok: 1 } : null;
                            }
                            return null;
                        },
                    };
                },
            };
        },
    });

    // Owner succeeds
    const ownerTarget = await requirePublishTarget(
        mockDb("admin", true),
        "user-owner",
        "org:org-1",
    );
    assert.equal(ownerTarget.publishedAs, "org:org-1");

    // Admin member succeeds
    const adminTarget = await requirePublishTarget(
        mockDb("admin"),
        "user-admin",
        "org:org-1",
    );
    assert.equal(adminTarget.publishedAs, "org:org-1");

    // Maintain member succeeds
    const maintainTarget = await requirePublishTarget(
        mockDb("maintain"),
        "user-maintain",
        "org:org-1",
    );
    assert.equal(maintainTarget.publishedAs, "org:org-1");

    // Write member succeeds
    const writeTarget = await requirePublishTarget(
        mockDb("write"),
        "user-write",
        "org:org-1",
    );
    assert.equal(writeTarget.publishedAs, "org:org-1");

    // Read-only member denied (fails closed with 403 publication_forbidden)
    await assert.rejects(
        requirePublishTarget(mockDb("read"), "user-read", "org:org-1"),
        (error) => {
            assert.equal(error.code, "publication_forbidden");
            assert.equal(error.status, 403);
            return true;
        },
    );

    // Non-member denied (fails closed with 403 publication_forbidden)
    await assert.rejects(
        requirePublishTarget(mockDb(null), "user-stranger", "org:org-1"),
        (error) => {
            assert.equal(error.code, "publication_forbidden");
            assert.equal(error.status, 403);
            return true;
        },
    );
});

test("collection access validation checks organization ownership of the collection", async () => {
    const mockDbWithCollection = (collectionBelongsToOrg) => ({
        prepare(sql) {
            return {
                bind(param1, param2) {
                    return {
                        async first() {
                            if (sql.includes("org_members")) return { ok: 1 };
                            if (
                                sql.includes(
                                    "collections WHERE id = ? AND org_id = ?",
                                )
                            ) {
                                return collectionBelongsToOrg
                                    ? { id: param1, org_id: param2 }
                                    : null;
                            }
                            return null;
                        },
                    };
                },
            };
        },
    });

    // Collection belongs to org
    const valid = await requirePublishTarget(
        mockDbWithCollection(true),
        "user-1",
        "org:org-1",
        "col-1",
    );
    assert.deepEqual(valid, {
        publishedAs: "org:org-1",
        collectionId: "col-1",
    });

    // Cross-tenant attempt: collection belongs to a different org
    await assert.rejects(
        requirePublishTarget(
            mockDbWithCollection(false),
            "user-1",
            "org:org-1",
            "col-other-org",
        ),
        (error) => {
            assert.equal(error.code, "invalid_collection");
            assert.match(
                error.message,
                /collection does not belong to this organization/,
            );
            return true;
        },
    );
});

test("cross-tenant mutations fail closed and reject malformed publishedAs target", async () => {
    const db = {
        prepare: () => ({ bind: () => ({ first: async () => null }) }),
    };

    // Malformed publication string
    await assert.rejects(
        requirePublishTarget(db, "user-1", "invalid:format"),
        (error) => error.code === "invalid_publication",
    );

    await assert.rejects(
        requirePublishTarget(db, "user-1", "org:"),
        (error) => error.code === "invalid_publication",
    );
});

test("isBlogOwner distinguishes author from organization admin/owner", async () => {
    const db = {
        prepare(_sql) {
            return {
                bind(userId, orgId) {
                    return {
                        async first() {
                            if (userId === "org-admin" && orgId === "org-1")
                                return { ok: 1 };
                            return null;
                        },
                    };
                },
            };
        },
    };

    // Author is always owner
    assert.equal(
        await isBlogOwner(
            db,
            { author_id: "user-1", published_as: "personal" },
            "user-1",
        ),
        true,
    );
    assert.equal(
        await isBlogOwner(
            db,
            { author_id: "user-1", published_as: "org:org-1" },
            "user-1",
        ),
        true,
    );

    // Org admin has owner permissions for org blog
    assert.equal(
        await isBlogOwner(
            db,
            { author_id: "user-other", published_as: "org:org-1" },
            "org-admin",
        ),
        true,
    );

    // Non-admin org member or stranger does NOT have owner permissions
    assert.equal(
        await isBlogOwner(
            db,
            { author_id: "user-other", published_as: "org:org-1" },
            "user-stranger",
        ),
        false,
    );
});
