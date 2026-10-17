import assert from "node:assert/strict";
import test from "node:test";

import { getPollinationsAccountSnapshot } from "../src/lib/pollinationsAccount.js";

for (const models of [
    ["flux", "klein"],
    ["black-forest-labs/flux.1-schnell", "black-forest-labs/flux.2-klein-4b"],
]) {
    test(`account usage and health recognize ${models.join(", ")}`, async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async (url) => ({
            ok: true,
            async json() {
                if (url.includes("/balance")) return { balance: 10 };
                if (url.includes("/usage"))
                    return {
                        data: [
                            { model: models[0], cost: 1, total_tokens: 4 },
                            { model_id: models[1], cost: 2, total_tokens: 8 },
                            {
                                model: "unrelated-model",
                                cost: 100,
                                total_tokens: 100,
                            },
                        ],
                    };
                return {
                    data: [
                        {
                            model: models[0],
                            status_2xx: 3,
                            errors_5xx: 1,
                            latency_p50_ms: 100,
                        },
                        {
                            model_id: models[1],
                            status_2xx: 2,
                            errors_5xx: 0,
                            latency_p50_ms: 200,
                        },
                    ],
                };
            },
        });

        try {
            const result =
                await getPollinationsAccountSnapshot("fixture-token");
            assert.equal(result.balance, 10);
            assert.equal(result.usage.requests, 2);
            assert.equal(result.usage.pollenSpent, 3);
            assert.equal(result.usage.totalTokens, 12);
            assert.deepEqual(result.health, [
                {
                    model: "flux",
                    available: true,
                    successRate: 75,
                    latencyMs: 100,
                },
                {
                    model: "klein",
                    available: true,
                    successRate: 100,
                    latencyMs: 200,
                },
            ]);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
}
