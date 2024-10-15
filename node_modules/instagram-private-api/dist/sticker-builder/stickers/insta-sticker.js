"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstaSticker = void 0;
const snakeCaseKeys = require("snakecase-keys");
const class_transformer_1 = require("class-transformer");
class InstaSticker {
    constructor() {
        this.rotation = 0.0;
        this.x = 0.0;
        this.y = 0.0;
        this.z = 0;
        this.isSticker = true;
    }
    get additionalConfigureProperties() {
        return null;
    }
    center() {
        this.x = 0.5;
        this.y = 0.5;
        return this;
    }
    rotateDeg(deg) {
        this.rotation = deg % 360.0;
        return this;
    }
    scale(factor) {
        this.width *= factor;
        this.height *= factor;
        return this;
    }
    moveForward(layers = 1) {
        this.z += layers;
        return this;
    }
    moveBackwards(layers = 1) {
        return this.moveForward(-layers);
    }
    right() {
        this.x = 1.0 - this.width / 2;
        return this;
    }
    left() {
        this.x = this.width / 2;
        return this;
    }
    top() {
        this.y = this.height / 2;
        return this;
    }
    bottom() {
        this.y = 1.0 - this.height / 2;
        return this;
    }
    toJSON() {
        return snakeCaseKeys((0, class_transformer_1.classToPlain)(this), { deep: true });
    }
}
exports.InstaSticker = InstaSticker;
//# sourceMappingURL=insta-sticker.js.map