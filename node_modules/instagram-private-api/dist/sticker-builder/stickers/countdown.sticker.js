"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CountdownSticker = void 0;
const insta_sticker_1 = require("./insta-sticker");
class CountdownSticker extends insta_sticker_1.InstaSticker {
    constructor() {
        super(...arguments);
        this.textColor = '#ffffff';
        this.startBackgroundColor = '#ca2ee1';
        this.endBackgroundColor = '#5eb1ff';
        this.digitColor = '#7e0091';
        this.digitCardColor = '#ffffffcc';
        this.followingEnabled = true;
        this.width = 0.703125;
        this.height = 0.26013514;
    }
    get endTs() {
        return this._endTs;
    }
    set endTs(value) {
        if (typeof value === 'number') {
            this._endTs = value;
        }
        else {
            this._endTs = Math.floor(value.toUTC().toSeconds());
        }
    }
    get id() {
        return 'countdown_sticker_time';
    }
    get key() {
        return 'story_countdowns';
    }
}
exports.CountdownSticker = CountdownSticker;
//# sourceMappingURL=countdown.sticker.js.map