"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HashtagSticker = void 0;
const insta_sticker_1 = require("./insta-sticker");
class HashtagSticker extends insta_sticker_1.InstaSticker {
    constructor() {
        super(...arguments);
        this.width = 0.47;
        this.height = 0.11;
    }
    get id() {
        return 'hashtag_sticker_vibrant';
    }
    get key() {
        return 'story_hashtags';
    }
}
exports.HashtagSticker = HashtagSticker;
//# sourceMappingURL=hashtag.sticker.js.map