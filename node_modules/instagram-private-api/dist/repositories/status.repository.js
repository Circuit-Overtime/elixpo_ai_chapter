"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusRepository = void 0;
const repository_1 = require("../core/repository");
class StatusRepository extends repository_1.Repository {
    async getViewableStatuses() {
        const { body } = await this.client.request.send({
            url: '/api/v1/status/get_viewable_statuses/',
            method: 'GET',
        });
        return body;
    }
}
exports.StatusRepository = StatusRepository;
//# sourceMappingURL=status.repository.js.map