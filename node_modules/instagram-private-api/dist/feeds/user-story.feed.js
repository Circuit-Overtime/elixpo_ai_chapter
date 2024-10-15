"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserStoryFeed = void 0;
const feed_1 = require("../core/feed");
class UserStoryFeed extends feed_1.Feed {
    async items() {
        const response = await this.request();
        if (!response.reel) {
            return [];
        }
        return response.reel.items;
    }
    async request() {
        const { body } = await this.client.request.send({
            url: `/api/v1/feed/user/${this.userId}/story/`,
            method: 'GET',
            qs: {
                supported_capabilities_new: JSON.stringify(this.client.state.supportedCapabilities),
            },
        });
        return body;
    }
    set state(response) { }
}
exports.UserStoryFeed = UserStoryFeed;
//# sourceMappingURL=user-story.feed.js.map