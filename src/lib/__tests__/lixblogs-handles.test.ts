import { describe, expect, it } from "vitest";
import { isLixBlogsOrgHandle } from "../lixblogs-handles";

const respond = (body: unknown, status = 200) =>
    (async () =>
        new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("isLixBlogsOrgHandle", () => {
    it("is true only for org handles", async () => {
        expect(
            await isLixBlogsOrgHandle(
                "salonist",
                respond({ available: false, takenBy: "org" }),
            ),
        ).toBe(true);
        // A LixBlogs user with this name is this service's own user, not a clash.
        expect(
            await isLixBlogsOrgHandle(
                "someone",
                respond({ available: false, takenBy: "user" }),
            ),
        ).toBe(false);
        expect(
            await isLixBlogsOrgHandle("free", respond({ available: true })),
        ).toBe(false);
    });

    it("uses the plain check-name form so the services cannot loop", async () => {
        let called = "";
        const spy = (async (url: string) => {
            called = url;
            return new Response(JSON.stringify({ available: true }));
        }) as unknown as typeof fetch;
        await isLixBlogsOrgHandle("acme", spy);
        expect(called).toBe("https://blogs.elixpo.com/api/check-name?name=acme");
    });

    it("fails open when LixBlogs is unreachable or erroring", async () => {
        const down = (async () => {
            throw new Error("network down");
        }) as unknown as typeof fetch;
        expect(await isLixBlogsOrgHandle("acme", down)).toBe(false);
        expect(
            await isLixBlogsOrgHandle(
                "acme",
                respond({ available: false, error: "unavailable" }, 503),
            ),
        ).toBe(false);
    });
});
