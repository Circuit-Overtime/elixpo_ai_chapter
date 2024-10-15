"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StickerBuilder = void 0;
const class_transformer_1 = require("class-transformer");
const lodash_1 = require("lodash");
const stickers_1 = require("./stickers");
class StickerBuilder {
    constructor() {
        this.stickers = [];
    }
    add(sticker) {
        this.stickers.push(sticker);
        return this;
    }
    build() {
        var _a;
        const map = new Map();
        for (const sticker of this.stickers) {
            if (map.has(sticker.key)) {
                (_a = map.get(sticker.key)) === null || _a === void 0 ? void 0 : _a.push(sticker);
            }
            else {
                map.set(sticker.key, [sticker]);
            }
        }
        const result = {};
        const ids = [];
        const additionalProperties = [];
        for (const stickers of map.values()) {
            Object.defineProperty(result, stickers[0].key, { value: JSON.stringify(stickers), enumerable: true });
            stickers.forEach(sticker => additionalProperties.push(sticker.additionalConfigureProperties));
            ids.push(stickers[0].id);
        }
        return Object.assign(Object.assign(Object.assign({}, (0, lodash_1.defaults)({}, ...additionalProperties)), result), { story_sticker_ids: ids.join(',') });
    }
    static hashtag(options) {
        return (0, class_transformer_1.plainToClass)(stickers_1.HashtagSticker, options);
    }
    static mention(options) {
        return (0, class_transformer_1.plainToClass)(stickers_1.MentionSticker, options);
    }
    static mentionReel(mediaInfo, additional = {}) {
        return StickerBuilder.mention(Object.assign({ userId: mediaInfo.user.pk.toString(), mediaId: mediaInfo.pk, displayType: 'mention_reshare', width: 0.7, height: 0.9 }, additional));
    }
    static location(options) {
        return (0, class_transformer_1.plainToClass)(stickers_1.LocationSticker, options);
    }
    static countdown(options) {
        return (0, class_transformer_1.plainToClass)(stickers_1.CountdownSticker, options);
    }
    static chat(options) {
        return (0, class_transformer_1.plainToClass)(stickers_1.ChatSticker, options);
    }
    static poll(options) {
        return (0, class_transformer_1.plainToClass)(stickers_1.PollSticker, options);
    }
    static question(options) {
        return (0, class_transformer_1.plainToClass)(stickers_1.QuestionSticker, options);
    }
    static quiz(options) {
        return (0, class_transformer_1.plainToClass)(stickers_1.QuizSticker, Object.assign({ width: 0.7291667, height: 0.11824318 + options.options.length * 0.10304056 }, options));
    }
    static slider(options) {
        return (0, class_transformer_1.plainToClass)(stickers_1.SliderSticker, options);
    }
    static attachment(options) {
        return (0, class_transformer_1.plainToClass)(stickers_1.AttachmentSticker, options);
    }
    static attachmentFromMedia(mediaInfo, additional = {}) {
        return StickerBuilder.attachment(Object.assign({ mediaId: mediaInfo.pk, mediaOwnerId: mediaInfo.user.pk.toString() }, additional));
    }
}
exports.StickerBuilder = StickerBuilder;
//# sourceMappingURL=sticker-builder.js.map