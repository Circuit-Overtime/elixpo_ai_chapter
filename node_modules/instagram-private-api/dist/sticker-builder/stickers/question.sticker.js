"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuestionSticker = void 0;
const insta_sticker_1 = require("./insta-sticker");
class QuestionSticker extends insta_sticker_1.InstaSticker {
    constructor() {
        super(...arguments);
        this.backgroundColor = '#ffffff';
        this.textColor = '#000000';
        this.profilePicUrl = '';
        this.questionType = 'text';
        this.viewerCanInteract = false;
        this.width = 0.7291667;
        this.height = 0.28716215;
    }
    get id() {
        return 'question_sticker_ama';
    }
    get key() {
        return 'story_questions';
    }
}
exports.QuestionSticker = QuestionSticker;
//# sourceMappingURL=question.sticker.js.map