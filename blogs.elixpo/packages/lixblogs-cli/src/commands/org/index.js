export async function orgList({ client }) {
    return client.list();
}

export async function orgGet({ client, id }) {
    if (!id) throw new Error("An organization ID or handle is required.");
    return client.get(id);
}

export async function orgCollections({ client, id }) {
    if (!id) throw new Error("An organization ID or handle is required.");
    return client.collections(id);
}

export async function orgMembers({ client, id }) {
    if (!id) throw new Error("An organization ID or handle is required.");
    return client.members(id);
}

export async function orgTargets({ client }) {
    return client.targets();
}
