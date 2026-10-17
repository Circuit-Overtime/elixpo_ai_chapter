import { createAuthorizationRequest } from "./authorization.js";
import { discoverAccounts } from "./discovery.js";
import { AccountsError } from "./errors.js";
import {
    exchangeAuthorizationCode,
    refreshTokens,
    revokeToken,
} from "./tokens.js";
import type {
    AccountsConfiguration,
    AuthorizationServerMetadata,
} from "./types.js";
import { verifyAccessToken, verifyIdToken } from "./verify.js";

export function createAccountsClient(configuration: AccountsConfiguration) {
    let metadataPromise: Promise<AuthorizationServerMetadata> | undefined;
    const metadata = () => {
        metadataPromise ??= discoverAccounts(configuration);
        return metadataPromise;
    };

    return {
        metadata,
        async createAuthorizationRequest(options?: {
            scopes?: string[];
            prompt?: "consent" | "login" | "select_account";
        }) {
            return createAuthorizationRequest(
                await metadata(),
                configuration,
                options,
            );
        },
        async exchangeAuthorizationCode(input: {
            code: string;
            codeVerifier: string;
        }) {
            return exchangeAuthorizationCode(
                await metadata(),
                configuration,
                input,
            );
        },
        async refresh(refreshToken: string, scopes?: string[]) {
            return refreshTokens(
                await metadata(),
                configuration,
                refreshToken,
                scopes,
            );
        },
        async revoke(
            token: string,
            tokenTypeHint: "access_token" | "refresh_token" = "refresh_token",
        ) {
            return revokeToken(
                await metadata(),
                configuration,
                token,
                tokenTypeHint,
            );
        },
        async verifyAccessToken(token: string) {
            if (!configuration.audience) {
                throw new AccountsError(
                    "configuration_error",
                    "audience is required to verify an access token",
                );
            }
            return verifyAccessToken(token, await metadata(), {
                audience: configuration.audience,
                clientId: configuration.clientId,
                fetch: configuration.fetch,
                timeoutMs: configuration.timeoutMs,
            });
        },
        async verifyIdToken(token: string, nonce?: string) {
            return verifyIdToken(token, await metadata(), {
                clientId: configuration.clientId,
                nonce,
                fetch: configuration.fetch,
                timeoutMs: configuration.timeoutMs,
            });
        },
    };
}
