"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PollSticker = void 0;
const insta_sticker_1 = require("./insta-sticker");
class PollSticker extends insta_sticker_1.InstaSticker {
    constructor() {
        super(...arguments);
        this.finished = false;
        this.viewerVote = 0;
        this.viewerCanVote = true;
        this.isSharedResult = false;
        this.width = 0.49934897;
        this.height = 0.1266892;
    }
    get tallies() {
        return this._tallies;
    }
    set tallies(value) {
        this._tallies = value.map(t => (Object.assign({ fontSize: 28.0 }, t)));
    }
    get id() {
        return 'polling_sticker_vibrant';
    }
    get key() {
        return 'story_polls';
    }
}
exports.PollSticker = PollSticker;
//# sourceMappingURL=poll.sticker.js.map