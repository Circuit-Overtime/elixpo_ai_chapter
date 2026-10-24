import assert from "node:assert/strict";
import test from "node:test";
import {
    orgCollections,
    orgGet,
    orgList,
    orgMembers,
    orgTargets,
} from "../src/commands/org/index.js";

test("orgList delegates to client.list()", async () => {
    let called = false;
    const client = {
        async list() {
            called = true;
            return { data: [{ id: "org-1", name: "Org 1" }] };
        },
    };
    const result = await orgList({ client });
    assert.equal(called, true);
    assert.equal(result.data.length, 1);
});

test("orgGet validates id and delegates to client.get(id)", async () => {
    const client = {
        async get(id) {
            return { id, name: "Sample Org" };
        },
    };
    await assert.rejects(
        orgGet({ client, id: "" }),
        /An organization ID or handle is required/,
    );
    const result = await orgGet({ client, id: "sample-org" });
    assert.equal(result.id, "sample-org");
});

test("orgCollections validates id and delegates to client.collections(id)", async () => {
    const client = {
        async collections(id) {
            return [{ id: "col-1", orgId: id, name: "Tech" }];
        },
    };
    await assert.rejects(
        orgCollections({ client, id: "" }),
        /An organization ID or handle is required/,
    );
    const result = await orgCollections({ client, id: "sample-org" });
    assert.equal(result[0].id, "col-1");
});

test("orgMembers validates id and delegates to client.members(id)", async () => {
    const client = {
        async members(_id) {
            return [{ userId: "u1", username: "alex", role: "admin" }];
        },
    };
    await assert.rejects(
        orgMembers({ client, id: "" }),
        /An organization ID or handle is required/,
    );
    const result = await orgMembers({ client, id: "sample-org" });
    assert.equal(result[0].username, "alex");
});

test("orgTargets delegates to client.targets()", async () => {
    let called = false;
    const client = {
        async targets() {
            called = true;
            return {
                personal: { target: "personal", name: "Personal Blog" },
                organizations: [
                    {
                        target: "org:o1",
                        orgId: "o1",
                        role: "write",
                        collections: [],
                    },
                ],
            };
        },
    };
    const result = await orgTargets({ client });
    assert.equal(called, true);
    assert.equal(result.personal.target, "personal");
    assert.equal(result.organizations.length, 1);
});
