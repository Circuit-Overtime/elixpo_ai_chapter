"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuizSticker = void 0;
const insta_sticker_1 = require("./insta-sticker");
class QuizSticker extends insta_sticker_1.InstaSticker {
    constructor() {
        super(...arguments);
        this.textColor = '#ffffff';
        this.startBackgroundColor = '#262626';
        this.endBackgroundColor = '#262626';
        this.viewerCanAnswer = false;
        this.viewerAnswer = -1;
        this.width = 0.7291667;
        this.height = 0.11824318 + 2 * 0.10304056;
    }
    set options(value) {
        let options;
        if (((x) => typeof x[0] === 'string')(value)) {
            options = value.map(o => ({ text: o, count: 0 }));
        }
        else {
            options = value;
        }
        this._options = options;
    }
    get options() {
        return this._options;
    }
    get id() {
        return 'quiz_story_sticker_default';
    }
    get key() {
        return 'story_quizs';
    }
}
exports.QuizSticker = QuizSticker;
//# sourceMappingURL=quiz.sticker.js.map