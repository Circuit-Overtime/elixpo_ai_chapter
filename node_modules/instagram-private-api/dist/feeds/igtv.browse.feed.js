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
exports.IgtvBrowseFeed = void 0;
const feed_1 = require("../core/feed");
const class_transformer_1 = require("class-transformer");
class IgtvBrowseFeed extends feed_1.Feed {
    constructor() {
        super(...arguments);
        this.isPrefetch = false;
    }
    async items() {
        const req = await this.request();
        return req.browse_items;
    }
    async request() {
        const { body } = await this.client.request.send({
            url: `/api/v1/igtv/${this.isPrefetch ? 'browse_feed' : 'non_prefetch_browse_feed'}/`,
            qs: Object.assign({}, (this.isPrefetch ? { prefetch: 1 } : { max_id: this.maxId })),
        });
        this.state = body;
        return body;
    }
    set state(response) {
        this.maxId = response.max_id;
        this.moreAvailable = !!response.more_available;
    }
}
__decorate([
    (0, class_transformer_1.Expose)(),
    __metadata("design:type", String)
], IgtvBrowseFeed.prototype, "maxId", void 0);
exports.IgtvBrowseFeed = IgtvBrowseFeed;
//# sourceMappingURL=igtv.browse.feed.js.map