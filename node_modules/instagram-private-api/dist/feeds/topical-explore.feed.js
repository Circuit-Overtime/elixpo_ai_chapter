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
exports.TopicalExploreFeed = void 0;
const feed_1 = require("../core/feed");
const class_transformer_1 = require("class-transformer");
const Chance = require("chance");
const chance = new Chance();
class TopicalExploreFeed extends feed_1.Feed {
    constructor() {
        super(...arguments);
        this.module = 'explore_popular';
        this.clusterId = 'explore_all:0';
        this.sessionId = chance.guid({ version: 4 });
    }
    set state(body) {
        this.nextMaxId = body.next_max_id;
        this.moreAvailable = body.more_available;
    }
    async items() {
        const res = await this.request();
        return res.sectional_items;
    }
    async request() {
        const { body } = await this.client.request.send({
            url: '/api/v1/discover/topical_explore/',
            method: 'GET',
            qs: {
                is_prefetch: false,
                omit_cover_media: true,
                max_id: this.nextMaxId,
                module: this.module,
                reels_configuration: 'hide_hero',
                use_sectional_payload: true,
                timezone_offset: this.client.state.timezoneOffset,
                lat: this.lat,
                lng: this.lng,
                cluster_id: this.clusterId,
                session_id: this.sessionId,
                include_fixed_destinations: true,
            },
        });
        return body;
    }
}
__decorate([
    (0, class_transformer_1.Expose)(),
    __metadata("design:type", String)
], TopicalExploreFeed.prototype, "nextMaxId", void 0);
exports.TopicalExploreFeed = TopicalExploreFeed;
//# sourceMappingURL=topical-explore.feed.js.map