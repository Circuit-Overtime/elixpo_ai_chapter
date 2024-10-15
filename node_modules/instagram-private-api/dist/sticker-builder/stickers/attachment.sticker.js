"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AttachmentSticker = void 0;
const insta_sticker_1 = require("./insta-sticker");
class AttachmentSticker extends insta_sticker_1.InstaSticker {
    constructor() {
        super(...arguments);
        this.width = 0.8;
        this.height = 0.67;
    }
    get id() {
        return `media_simple_${this.mediaId}`;
    }
    get key() {
        return 'attached_media';
    }
    get additionalConfigureProperties() {
        return {
            reshared_media_id: this.mediaId,
        };
    }
}
exports.AttachmentSticker = AttachmentSticker;
//# sourceMappingURL=attachment.sticker.js.map