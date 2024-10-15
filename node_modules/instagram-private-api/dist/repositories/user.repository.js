"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRepository = void 0;
const repository_1 = require("../core/repository");
const errors_1 = require("../errors");
const lodash_1 = require("lodash");
const Chance = require("chance");
class UserRepository extends repository_1.Repository {
    async info(id) {
        const { body } = await this.client.request.send({
            url: `/api/v1/users/${id}/info/`,
        });
        return body.user;
    }
    async usernameinfo(username) {
        const { body } = await this.client.request.send({
            url: `/api/v1/users/${username}/usernameinfo/`,
        });
        return body.user;
    }
    async arlinkDownloadInfo() {
        const { body } = await this.client.request.send({
            url: `/api/v1/users/arlink_download_info/`,
            qs: {
                version_override: '2.0.2',
            },
        });
        return body.user;
    }
    async search(username) {
        const { body } = await this.client.request.send({
            url: `/api/v1/users/search/`,
            qs: {
                timezone_offset: this.client.state.timezoneOffset,
                q: username,
                count: 30,
            },
        });
        return body;
    }
    async searchExact(username) {
        username = username.toLowerCase();
        const result = await this.search(username);
        const users = result.users;
        const account = users.find(user => user.username === username);
        if (!account) {
            throw new errors_1.IgExactUserNotFoundError();
        }
        return account;
    }
    async accountDetails(id) {
        id = id || this.client.state.cookieUserId;
        const { body } = await this.client.request.send({
            url: `/api/v1/users/${id}/account_details/`,
        });
        return body;
    }
    async formerUsernames(id) {
        id = id || this.client.state.cookieUserId;
        const { body } = await this.client.request.send({
            url: `/api/v1/users/${id}/former_usernames/`,
        });
        return body;
    }
    async sharedFollowerAccounts(id) {
        const { body } = await this.client.request.send({
            url: `/api/v1/users/${id}/shared_follower_accounts/`,
        });
        return body;
    }
    async flagUser(id) {
        const { body } = await this.client.request.send({
            url: `/api/v1/users/${id}/flag_user/`,
            method: 'POST',
            form: {
                _csrftoken: this.client.state.cookieCsrfToken,
                _uid: this.client.state.cookieUserId,
                _uuid: this.client.state.uuid,
                reason_id: 1,
                user_id: id,
                source_name: 'profile',
                is_spam: true,
            },
        });
        return body;
    }
    async getIdByUsername(username) {
        const user = await this.searchExact(username);
        return user.pk;
    }
    async lookup(options) {
        options = (0, lodash_1.defaults)(options, {
            waterfallId: new Chance().guid({ version: 4 }),
            directlySignIn: true,
            countryCodes: [{ country_code: '1', source: ['default'] }],
        });
        const { body } = await this.client.request.send({
            url: '/api/v1/users/lookup/',
            method: 'POST',
            form: this.client.request.sign({
                country_codes: JSON.stringify(options.countryCodes),
                _csrftoken: this.client.state.cookieCsrfToken,
                q: options.query,
                guid: this.client.state.uuid,
                device_id: this.client.state.deviceId,
                waterfall_id: options.waterfallId,
                directly_sign_in: options.directlySignIn.toString(),
            }),
        });
        return body;
    }
}
exports.UserRepository = UserRepository;
//# sourceMappingURL=user.repository.js.map