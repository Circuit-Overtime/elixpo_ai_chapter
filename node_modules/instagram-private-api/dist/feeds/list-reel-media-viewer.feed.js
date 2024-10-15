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
exports.ListReelMediaViewerFeed = void 0;
const feed_1 = require("../core/feed");
const class_transformer_1 = require("class-transformer");
class ListReelMediaViewerFeed extends feed_1.Feed {
    constructor() {
        super(...arguments);
        this.nextMaxId = undefined;
    }
    async items() {
        const res = await this.request();
        return res.users;
    }
    set state(response) {
        this.nextMaxId = response.next_max_id;
    }
    async request() {
        const { body } = await this.client.request.send({
            url: `/api/v1/media/${this.mediaId}/list_reel_media_viewer`,
            method: 'GET',
            qs: {
                supported_capabilities_new: this.client.state.supportedCapabilities,
                max_id: this.nextMaxId,
            },
        });
        this.state = body;
        return body;
    }
    isMoreAvailable() {
        return this.nextMaxId !== null;
    }
}
__decorate([
    (0, class_transformer_1.Expose)(),
    __metadata("design:type", String)
], ListReelMediaViewerFeed.prototype, "mediaId", void 0);
__decorate([
    (0, class_transformer_1.Expose)(),
    __metadata("design:type", String)
], ListReelMediaViewerFeed.prototype, "nextMaxId", void 0);
exports.ListReelMediaViewerFeed = ListReelMediaViewerFeed;
//# sourceMappingURL=list-reel-media-viewer.feed.js.map