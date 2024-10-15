"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SliderSticker = void 0;
const insta_sticker_1 = require("./insta-sticker");
class SliderSticker extends insta_sticker_1.InstaSticker {
    constructor() {
        super(...arguments);
        this.backgroundColor = '#ffffff';
        this.textColor = '#000000';
        this.viewerCanVote = false;
        this.sliderVoteCount = 0;
        this.viewerVote = -1.0;
        this.sliderVoteAverage = 0.0;
        this.width = 0.7291667;
        this.height = 0.22212838;
    }
    get id() {
        return `emoji_slider_${this.emoji}`;
    }
    get key() {
        return 'story_sliders';
    }
}
exports.SliderSticker = SliderSticker;
//# sourceMappingURL=slider.sticker.js.map