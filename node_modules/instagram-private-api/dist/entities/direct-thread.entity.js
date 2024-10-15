"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DirectThreadEntity = void 0;
const entity_1 = require("../core/entity");
const errors_1 = require("../errors");
const publish_service_1 = require("../services/publish.service");
const Bluebird = require("bluebird");
class DirectThreadEntity extends entity_1.Entity {
    constructor() {
        super(...arguments);
        this.threadId = null;
        this.userIds = null;
    }
    async deleteItem(itemId) {
        if (!this.threadId) {
            throw new errors_1.IgClientError('threadId was null.');
        }
        return this.client.directThread.deleteItem(this.threadId, itemId);
    }
    async broadcastText(text, skipLinkCheck) {
        if (!skipLinkCheck) {
            const urls = text.match(require('url-regex-safe')({ strict: false }));
            if (urls instanceof Array) {
                return this.broadcastLink(text, urls);
            }
        }
        return await this.broadcast({
            item: 'text',
            form: {
                text,
            },
        });
    }
    async broadcastReel(options) {
        return await this.broadcast({
            item: 'reel_share',
            form: {
                media_id: options.mediaId,
                reel_id: options.reelId || options.mediaId.split('_')[1],
                text: options.text,
                entry: 'reel',
            },
            qs: {
                media_type: options.mediaType || 'photo',
            },
        });
    }
    async broadcastUserStory(options) {
        return await this.broadcast({
            item: 'story_share',
            form: {
                story_media_id: options.mediaId,
                reel_id: options.reelId || options.mediaId.split('_')[1],
                text: options.text,
            },
            qs: {
                media_type: options.mediaType || 'photo',
            },
            signed: true,
        });
    }
    async broadcastProfile(id) {
        return await this.broadcast({
            item: 'profile',
            form: {
                profile_user_id: id,
            },
        });
    }
    async broadcastLink(link_text, link_urls) {
        return await this.broadcast({
            item: 'link',
            form: {
                link_text,
                link_urls: JSON.stringify(link_urls),
            },
        });
    }
    async broadcastPhoto(options) {
        const { upload_id } = await this.client.upload.photo({
            uploadId: options.uploadId,
            file: options.file,
        });
        return await this.broadcast({
            item: 'configure_photo',
            form: {
                allow_full_aspect_ratio: options.allowFullAspectRatio || true,
                upload_id,
            },
        });
    }
    async broadcastPost(mediaId) {
        return await this.broadcast({
            item: 'media_share',
            form: {
                media_id: mediaId,
                carousel_share_child_media_id: mediaId,
                send_attribution: 'feed_contextual_profile',
                unified_broadcast_format: 1,
            },
        });
    }
    async broadcastVideo(options) {
        const uploadId = options.uploadId || Date.now().toString();
        const videoInfo = publish_service_1.PublishService.getVideoInfo(options.video);
        await this.client.upload.video(Object.assign({ video: options.video, uploadId, isDirect: true }, videoInfo));
        await Bluebird.try(() => this.client.media.uploadFinish({
            upload_id: uploadId,
            source_type: '2',
            video: { length: videoInfo.duration / 1000.0 },
        })).catch(errors_1.IgResponseError, publish_service_1.PublishService.catchTranscodeError(videoInfo, options.transcodeDelay || 4 * 1000));
        return await this.broadcast({
            item: 'configure_video',
            form: {
                video_result: '',
                upload_id: uploadId,
                sampled: typeof options.sampled !== 'undefined' ? options.sampled : true,
            },
        });
    }
    async broadcastVoice(options) {
        const duration = publish_service_1.PublishService.getMP4Duration(options.file);
        const uploadId = options.uploadId || Date.now().toString();
        await this.client.upload.video({
            duration,
            video: options.file,
            uploadId,
            isDirectVoice: true,
            mediaType: '11',
        });
        await Bluebird.try(() => this.client.media.uploadFinish({
            upload_id: uploadId,
            source_type: '4',
        })).catch(errors_1.IgResponseError, publish_service_1.PublishService.catchTranscodeError({ duration }, options.transcodeDelay || 4 * 1000));
        return await this.broadcast({
            item: 'share_voice',
            form: {
                waveform: JSON.stringify(options.waveform || Array.from(Array(20), (_, i) => Math.sin(i * (Math.PI / 10)) * 0.5 + 0.5)),
                waveform_sampling_frequency_hz: options.waveformSamplingFrequencyHz || '10',
                upload_id: uploadId,
            },
        });
    }
    async broadcastStory(input) {
        const options = input instanceof Buffer ? { file: input } : input;
        const baseOptions = Object.assign(Object.assign({}, options), { viewMode: options.viewMode || 'replayable', replyType: options.replyType });
        if (this.threadId !== null) {
            return await this.client.publish.story(Object.assign(Object.assign({}, baseOptions), { threadIds: [this.threadId] }));
        }
        if (this.userIds !== null) {
            return await this.client.publish.story(Object.assign(Object.assign({}, baseOptions), { recipientUsers: this.userIds }));
        }
        throw new Error('DirectThread: No recipients set');
    }
    async updateTitle(title) {
        return await this.client.directThread.updateTitle(this.threadId, title);
    }
    async mute() {
        return await this.client.directThread.mute(this.threadId);
    }
    async unmute() {
        return await this.client.directThread.unmute(this.threadId);
    }
    async hide() {
        return await this.client.directThread.hide(this.threadId);
    }
    async leave() {
        return await this.client.directThread.leave(this.threadId);
    }
    async addUser(userIds) {
        return await this.client.directThread.addUser(this.threadId, userIds);
    }
    async markItemSeen(threadItemId) {
        return await this.client.directThread.markItemSeen(this.threadId, threadItemId);
    }
    async broadcast(options) {
        if (this.threadId === null && this.userIds === null) {
            throw new Error('DirectThread: No recipients set');
        }
        const baseParams = {
            item: options.item,
            form: options.form,
            qs: options.qs,
            signed: options.signed,
        };
        let params;
        if (this.threadId) {
            params = Object.assign(baseParams, { threadIds: this.threadId });
        }
        else {
            params = Object.assign(baseParams, { userIds: this.userIds });
        }
        const response = await this.client.directThread.broadcast(params);
        if (response.payload) {
            this.threadId = response.payload.thread_id;
            this.userIds = null;
            return response.payload;
        }
        else if (response.message_metadata) {
            const [first] = response.message_metadata;
            this.threadId = first.thread_id;
            this.userIds = null;
            return response;
        }
    }
}
exports.DirectThreadEntity = DirectThreadEntity;
//# sourceMappingURL=direct-thread.entity.js.map