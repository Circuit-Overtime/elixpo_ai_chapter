"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IgExactUserNotFoundError = void 0;
const ig_client_error_1 = require("./ig-client.error");
class IgExactUserNotFoundError extends ig_client_error_1.IgClientError {
    constructor() {
        super('User with exact username not found.');
    }
}
exports.IgExactUserNotFoundError = IgExactUserNotFoundError;
//# sourceMappingURL=ig-exact-user-not-found-error.js.map