"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocationSticker = void 0;
const insta_sticker_1 = require("./insta-sticker");
class LocationSticker extends insta_sticker_1.InstaSticker {
    constructor() {
        super(...arguments);
        this.width = 0.47;
        this.height = 0.111;
    }
    get id() {
        return 'location_sticker_vibrant';
    }
    get key() {
        return 'story_locations';
    }
}
exports.LocationSticker = LocationSticker;
//# sourceMappingURL=location.sticker.js.map