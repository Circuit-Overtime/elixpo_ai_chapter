"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatSticker = void 0;
const insta_sticker_1 = require("./insta-sticker");
class ChatSticker extends insta_sticker_1.InstaSticker {
    constructor() {
        super(...arguments);
        this.startBackgroundColor = '#3897f0';
        this.endBackgroundColor = '#27c4f5';
        this.hasStartedChat = false;
        this.width = 0.453125;
        this.height = 0.1266892;
    }
    get id() {
        return 'chat_sticker_id';
    }
    get key() {
        return 'story_chats';
    }
}
exports.ChatSticker = ChatSticker;
//# sourceMappingURL=chat.sticker.js.map