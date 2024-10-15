"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LikedFeed = void 0;
const feed_1 = require("../core/feed");
const class_transformer_1 = require("class-transformer");
class LikedFeed extends feed_1.Feed {
    async items() {
        const res = await this.request();
        return res.items;
    }
    async request() {
        const { body } = await this.client.request.send({
            url: `/api/v1/feed/liked/`,
            method: 'GET',
            qs: {
                max_id: this.maxId,
            },
        });
        this.state = body;
        return body;
    }
    set state(response) {
        var _a;
        this.moreAvailable = response.more_available;
        this.maxId = (_a = response.next_max_id) === null || _a === void 0 ? void 0 : _a.toString();
    }
}
__decorate([
    (0, class_transformer_1.Expose)(),
    __metadata("design:type", String)
], LikedFeed.prototype, "maxId", void 0);
exports.LikedFeed = LikedFeed;
//# sourceMappingURL=liked.feed.js.map