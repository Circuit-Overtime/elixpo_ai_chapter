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
exports.MediaInlineChildCommentsFeed = void 0;
const feed_1 = require("../core/feed");
const class_transformer_1 = require("class-transformer");
class MediaInlineChildCommentsFeed extends feed_1.Feed {
    set state(state) {
        this.moreAvailable = !!state.next_max_child_cursor;
        this.nextMaxId = state.next_max_child_cursor;
        this.nextMinId = undefined;
    }
    async request() {
        const { body } = await this.client.request.send({
            url: `/api/v1/media/${this.mediaId}/comments/${this.commentId}/inline_child_comments/`,
            qs: {
                min_id: this.nextMinId,
                max_id: this.nextMaxId,
            },
        });
        this.state = body;
        return body;
    }
    async items() {
        const req = await this.request();
        return req.child_comments;
    }
}
__decorate([
    (0, class_transformer_1.Expose)(),
    __metadata("design:type", String)
], MediaInlineChildCommentsFeed.prototype, "nextMaxId", void 0);
__decorate([
    (0, class_transformer_1.Expose)(),
    __metadata("design:type", String)
], MediaInlineChildCommentsFeed.prototype, "nextMinId", void 0);
exports.MediaInlineChildCommentsFeed = MediaInlineChildCommentsFeed;
//# sourceMappingURL=media.inline-child-comments.feed.js.map