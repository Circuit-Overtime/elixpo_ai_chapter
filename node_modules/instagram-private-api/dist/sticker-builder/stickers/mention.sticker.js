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
exports.MentionSticker = void 0;
const insta_sticker_1 = require("./insta-sticker");
const decorators_1 = require("../../decorators");
class MentionSticker extends insta_sticker_1.InstaSticker {
    constructor() {
        super(...arguments);
        this.displayType = 'mention_username';
        this.width = 0.64;
        this.height = 0.125;
    }
    get id() {
        return 'mention_sticker_vibrant';
    }
    get key() {
        return 'reel_mentions';
    }
    get additionalConfigureProperties() {
        return this.displayType === 'mention_reshare' ? { reshared_media_id: this.mediaId } : null;
    }
}
__decorate([
    (0, decorators_1.Enumerable)(false),
    __metadata("design:type", String)
], MentionSticker.prototype, "mediaId", void 0);
exports.MentionSticker = MentionSticker;
//# sourceMappingURL=mention.sticker.js.map