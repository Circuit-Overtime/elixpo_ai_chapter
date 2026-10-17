import type { OAuthErrorCode } from "./types.js";

export type AccountsErrorCode =
    | "configuration_error"
    | "discovery_error"
    | "network_error"
    | "oauth_error"
    | "protocol_error"
    | "state_mismatch"
    | "nonce_mismatch"
    | "token_verification_error";

export class AccountsError extends Error {
    readonly code: AccountsErrorCode;
    readonly oauthCode?: OAuthErrorCode;
    readonly retryable: boolean;
    readonly status?: number;

    constructor(
        code: AccountsErrorCode,
        message: string,
        options: {
            oauthCode?: OAuthErrorCode;
            retryable?: boolean;
            status?: number;
            cause?: unknown;
        } = {},
    ) {
        super(message, { cause: options.cause });
        this.name = "AccountsError";
        this.code = code;
        this.oauthCode = options.oauthCode;
        this.retryable = options.retryable ?? false;
        this.status = options.status;
    }
}
