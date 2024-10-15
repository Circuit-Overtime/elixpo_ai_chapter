"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IgtvRepository = void 0;
const repository_1 = require("../core/repository");
const lodash_1 = require("lodash");
const Chance = require("chance");
class IgtvRepository extends repository_1.Repository {
    async writeSeenState(options) {
        const { body } = await this.client.request.send({
            url: '/api/v1/igtv/write_seen_state/',
            method: 'POST',
            form: this.client.request.sign({
                seen_state: JSON.stringify((0, lodash_1.defaults)(options, { impressions: {}, grid_impressions: [] })),
                _csrftoken: this.client.state.cookieCsrfToken,
                _uid: this.client.state.cookieUserId,
                _uuid: this.client.state.uuid,
            }),
        });
        return body;
    }
    async search(query = '') {
        const { body } = await this.client.request.send({
            url: `/api/v1/igtv/${query && query.length > 0 ? 'search' : 'suggested_searches'}/`,
            method: 'GET',
            qs: {
                query,
            },
        });
        return body;
    }
    async allUserSeries(user, data = {}) {
        const { body } = await this.client.request.send({
            url: `/api/v1/igtv/series/all_user_series/${user}/`,
            method: 'GET',
            qs: this.client.request.sign(data),
        });
        return body;
    }
    async createSeries(title, description = '') {
        const { body } = await this.client.request.send({
            url: `/api/v1/igtv/series/create/`,
            method: 'POST',
            form: this.client.request.sign({
                title,
                description,
                igtv_composer_session_id: new Chance().guid({ version: 4 }),
                _csrftoken: this.client.state.cookieCsrfToken,
                _uid: this.client.state.cookieUserId,
                _uuid: this.client.state.uuid,
            }),
        });
        return body;
    }
    async seriesAddEpisode(series, mediaId) {
        const { body } = await this.client.request.send({
            url: `/api/v1/igtv/series/${series}/add_episode/`,
            method: 'POST',
            form: {
                media_id: mediaId,
                _csrftoken: this.client.state.cookieCsrfToken,
                _uuid: this.client.state.uuid,
            },
        });
        return body;
    }
}
exports.IgtvRepository = IgtvRepository;
//# sourceMappingURL=igtv.repository.js.map