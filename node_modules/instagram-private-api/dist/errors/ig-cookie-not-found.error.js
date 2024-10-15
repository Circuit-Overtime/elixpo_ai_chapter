"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IgCookieNotFoundError = void 0;
const ig_client_error_1 = require("./ig-client.error");
class IgCookieNotFoundError extends ig_client_error_1.IgClientError {
    constructor(name) {
        super(`Cookie "${name}" not found`);
    }
}
exports.IgCookieNotFoundError = IgCookieNotFoundError;
//# sourceMappingURL=ig-cookie-not-found.error.js.map