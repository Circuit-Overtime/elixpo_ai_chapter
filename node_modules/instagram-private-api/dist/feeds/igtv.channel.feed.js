"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IgtvChannelFeed = void 0;
const feed_1 = require("../core/feed");
const class_transformer_1 = require("class-transformer");
class IgtvChannelFeed extends feed_1.Feed {
    set state(response) {
        this.moreAvailable = response.more_available;
        this.maxId = response.max_id;
    }
    async request() {
        const { body } = await this.client.request.send({
            url: '/api/v1/igtv/channel/',
            form: {
                id: this.channelId,
                max_id: this.maxId,
                phone_id: this.client.state.phoneId,
                battery_level: this.client.state.batteryLevel,
                _csrftoken: this.client.state.cookieCsrfToken,
                _uuid: this.client.state.uuid,
                is_charging: this.client.state.isCharging ? '1' : '0',
                will_sound_on: '0',
            },
            method: 'POST',
        });
        this.state = body;
        return body;
    }
    async items() {
        const res = await this.request();
        return res.items;
    }
}
__decorate([
    (0, class_transformer_1.Expose)(),
    __metadata("design:type", String)
], IgtvChannelFeed.prototype, "maxId", void 0);
exports.IgtvChannelFeed = IgtvChannelFeed;
//# sourceMappingURL=igtv.channel.feed.js.map