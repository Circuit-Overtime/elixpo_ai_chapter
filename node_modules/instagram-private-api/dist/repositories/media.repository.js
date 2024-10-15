"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaRepository = void 0;
const lodash_1 = require("lodash");
const luxon_1 = require("luxon");
const repository_1 = require("../core/repository");
const Chance = require("chance");
class MediaRepository extends repository_1.Repository {
    async info(mediaId) {
        const { body } = await this.client.request.send({
            url: `/api/v1/media/${mediaId}/info/`,
            method: 'GET',
            form: this.client.request.sign({
                igtv_feed_preview: false,
                media_id: mediaId,
                _csrftoken: this.client.state.cookieCsrfToken,
                _uid: this.client.state.cookieUserId,
                _uuid: this.client.state.uuid,
            }),
        });
        return body;
    }
    async editMedia({ mediaId, captionText, }) {
        const { body } = await this.client.request.send({
            url: `/api/v1/media/${mediaId}/edit_media/`,
            method: 'POST',
            form: this.client.request.sign({
                igtv_feed_preview: false,
                media_id: mediaId,
                _csrftoken: this.client.state.cookieCsrfToken,
                _uid: this.client.state.cookieUserId,
                _uuid: this.client.state.uuid,
                caption_text: captionText,
            }),
        });
        return body;
    }
    async delete({ mediaId, mediaType = 'PHOTO', }) {
        const { body } = await this.client.request.send({
            url: `/api/v1/media/${mediaId}/delete/`,
            method: 'POST',
            qs: {
                media_type: mediaType,
            },
            form: this.client.request.sign({
                igtv_feed_preview: false,
                media_id: mediaId,
                _csrftoken: this.client.state.cookieCsrfToken,
                _uid: this.client.state.cookieUserId,
                _uuid: this.client.state.uuid,
            }),
        });
        return body;
    }
    async likeAction(options) {
        const signedFormData = this.client.request.sign(Object.assign(Object.assign({ module_name: options.moduleInfo.module_name, media_id: options.mediaId, _csrftoken: this.client.state.cookieCsrfToken }, (0, lodash_1.omit)(options.moduleInfo, 'module_name')), { radio_type: this.client.state.radioType, _uid: this.client.state.cookieUserId, device_id: this.client.state.deviceId, _uuid: this.client.state.uuid }));
        const { body } = await this.client.request.send({
            url: `/api/v1/media/${options.mediaId}/${options.action}/`,
            method: 'POST',
            form: Object.assign(Object.assign({}, signedFormData), { d: options.d }),
        });
        return body;
    }
    async like(options) {
        return this.likeAction(Object.assign({ action: 'like' }, options));
    }
    async unlike(options) {
        return this.likeAction(Object.assign({ action: 'unlike' }, options));
    }
    async likeComment(commentId) {
        const { body } = await this.client.request.send({
            url: `/api/v1/media/${commentId}/comment_like/`,
            method: 'POST',
        });
        return body;
    }
    async unlikeComment(commentId) {
        const { body } = await this.client.request.send({
            url: `/api/v1/media/${commentId}/comment_unlike/`,
            method: 'POST',
        });
        return body;
    }
    async checkOffensiveComment(commentText, mediaId) {
        const { body } = await this.client.request.send({
            url: '/api/v1/media/comment/check_offensive_comment/',
            method: 'POST',
            form: this.client.request.sign({
                media_id: mediaId,
                _csrftoken: this.client.state.cookieCsrfToken,
                _uid: this.client.state.cookieUserId,
                _uuid: this.client.state.uuid,
                comment_text: commentText,
            }),
        });
        return body;
    }
    async commentsBulkDelete(mediaId, commentIds) {
        const { body } = await this.client.request.send({
            url: `/api/v1/media/${mediaId}/comment/bulk_delete/`,
            method: 'POST',
            form: this.client.request.sign({
                comment_ids_to_delete: commentIds.join(','),
                _csrftoken: this.client.state.cookieCsrfToken,
                _uid: this.client.state.cookieUserId,
                _uuid: this.client.state.uuid,
            }),
        });
        return body;
    }
    async comment({ mediaId, text, replyToCommentId, module = 'self_comments_v2', }) {
        const { body } = await this.client.request.send({
            url: `/api/v1/media/${mediaId}/comment/`,
            method: 'POST',
            form: this.client.request.sign({
                user_breadcrumb: this.client.request.userBreadcrumb(text.length),
                idempotence_token: new Chance().guid(),
                _csrftoken: this.client.state.cookieCsrfToken,
                radio_type: this.client.state.radioType,
                _uid: this.client.state.cookieUserId,
                device_id: this.client.state.deviceId,
                _uuid: this.client.state.uuid,
                comment_text: text,
                containermodule: module,
                replied_to_comment_id: replyToCommentId,
            }),
        });
        return body.comment;
    }
    async commentsDisable(mediaId) {
        const { body } = await this.client.request.send({
            url: `/api/v1/media/${mediaId}/disable_comments/`,
            method: 'POST',
            form: this.client.request.sign({
                _csrftoken: this.client.state.cookieCsrfToken,
                _uid: this.client.state.cookieUserId,
                _uuid: this.client.state.uuid,
            }),
        });
        return body;
    }
    async commentsEnable(mediaId) {
        const { body } = await this.client.request.send({
            url: `/api/v1/media/${mediaId}/enable_comments/`,
            method: 'POST',
            form: this.client.request.sign({
                _csrftoken: this.client.state.cookieCsrfToken,
                _uid: this.client.state.cookieUserId,
                _uuid: this.client.state.uuid,
            }),
        });
        return body;
    }
    async likers(id) {
        const { body } = await this.client.request.send({
            url: `/api/v1/media/${id}/likers/`,
        });
        return body;
    }
    async blocked() {
        const { body } = await this.client.request.send({
            url: `/api/v1/media/blocked/`,
        });
        return body.media_ids;
    }
    async uploadFinish(options) {
        if (options.video) {
            options.video = (0, lodash_1.defaultsDeep)(options.video, {
                clips: [{ length: options.video.length, source_type: options.source_type }],
                poster_frame_index: 0,
                audio_muted: false,
            });
        }
        const { body } = await this.client.request.send({
            url: '/api/v1/media/upload_finish/',
            method: 'POST',
            headers: {
                retry_context: JSON.stringify({ num_step_auto_retry: 0, num_reupload: 0, num_step_manual_retry: 0 }),
            },
            form: this.client.request.sign(Object.assign({ timezone_offset: this.client.state.timezoneOffset, _csrftoken: this.client.state.cookieCsrfToken, source_type: options.source_type, _uid: this.client.state.cookieUserId, device_id: this.client.state.deviceId, _uuid: this.client.state.uuid, upload_id: options.upload_id, device: this.client.state.devicePayload }, options.video)),
            qs: options.video ? { video: '1' } : {},
        });
        return body;
    }
    applyConfigureDefaults(options, defaults) {
        const width = options.width || 1520;
        const height = options.height || 2048;
        const devicePayload = this.client.state.devicePayload;
        return (0, lodash_1.defaultsDeep)(options, Object.assign({ _csrftoken: this.client.state.cookieCsrfToken, _uid: this.client.state.cookieUserId, _uuid: this.client.state.uuid, device: devicePayload, extra: { source_width: width, source_height: height } }, defaults));
    }
    async configure(options) {
        const devicePayload = this.client.state.devicePayload;
        const now = luxon_1.DateTime.local().toFormat('yyyy:mm:dd HH:mm:ss');
        const width = options.width || 1520;
        const height = options.height || 2048;
        const form = this.applyConfigureDefaults(options, {
            width,
            height,
            upload_id: Date.now().toString(),
            timezone_offset: this.client.state.timezoneOffset,
            date_time_original: now,
            date_time_digitalized: now,
            caption: '',
            source_type: '4',
            media_folder: 'Camera',
            edits: {
                crop_original_size: [width, height],
                crop_center: [0.0, -0.0],
                crop_zoom: 1.0,
            },
            camera_model: devicePayload.model,
            scene_capture_type: 'standard',
            device_id: this.client.state.deviceId,
            creation_logger_session_id: this.client.state.clientSessionId,
            software: '1',
            camera_make: devicePayload.manufacturer,
        });
        if (typeof form.usertags !== 'undefined') {
            form.usertags = JSON.stringify(form.usertags);
        }
        if (typeof form.location !== 'undefined') {
            form.location = JSON.stringify(form.location);
        }
        const { body } = await this.client.request.send({
            url: '/api/v1/media/configure/',
            method: 'POST',
            form: this.client.request.sign(form),
        });
        return body;
    }
    async configureVideo(options) {
        const now = luxon_1.DateTime.local().toFormat('yyyy:mm:dd HH:mm:ss');
        const form = this.applyConfigureDefaults(options, {
            width: options.width,
            height: options.height,
            upload_id: Date.now().toString(),
            timezone_offset: this.client.state.timezoneOffset,
            date_time_original: now,
            caption: '',
            source_type: '4',
            device_id: this.client.state.deviceId,
            filter_type: '0',
            audio_muted: false,
            poster_frame_index: 0,
        });
        if (typeof form.usertags !== 'undefined') {
            form.usertags = JSON.stringify(form.usertags);
        }
        if (typeof form.location !== 'undefined') {
            form.location = JSON.stringify(form.location);
        }
        const { body } = await this.client.request.send({
            url: '/api/v1/media/configure/',
            method: 'POST',
            qs: {
                video: '1',
            },
            form: this.client.request.sign(form),
        });
        return body;
    }
    static stringifyStoryStickers(form) {
        const serialize = (obj) => {
            if (typeof obj !== 'undefined' && Array.isArray(obj) && obj.length > 0 && typeof obj[0] !== 'string') {
                return JSON.stringify(obj);
            }
            return obj;
        };
        form.story_hashtags = serialize(form.story_hashtags);
        form.story_locations = serialize(form.story_locations);
        form.reel_mentions = serialize(form.reel_mentions);
        form.story_polls = serialize(form.story_polls);
        form.story_sliders = serialize(form.story_sliders);
        form.story_questions = serialize(form.story_questions);
        form.story_countdowns = serialize(form.story_countdowns);
        form.attached_media = serialize(form.attached_media);
        form.story_cta = serialize(form.story_cta);
        form.story_chats = serialize(form.story_chats);
        form.story_quizs = serialize(form.story_quizs);
    }
    async configureToStory(options) {
        const now = Date.now();
        const width = options.width || 1520;
        const height = options.height || 2048;
        const form = this.applyConfigureDefaults(options, {
            width,
            height,
            source_type: '3',
            configure_mode: '1',
            client_shared_at: now.toString(),
            edits: {
                crop_original_size: [width, height],
                crop_center: [0.0, -0.0],
                crop_zoom: 1.0,
            },
        });
        form.source_type = '3';
        if (form.configure_mode === '1') {
            MediaRepository.stringifyStoryStickers(form);
        }
        else if (form.configure_mode === '2') {
            if (typeof form.recipient_users !== 'string') {
                form.recipient_users = JSON.stringify(form.recipient_users ? [form.recipient_users.map(x => Number(x))] : []);
            }
            form.thread_ids = JSON.stringify(form.thread_ids || []);
        }
        const { body } = await this.client.request.send({
            url: '/api/v1/media/configure_to_story/',
            method: 'POST',
            form: this.client.request.sign(form),
        });
        return body;
    }
    async configureToStoryVideo(options) {
        const now = Date.now();
        const devicePayload = this.client.state.devicePayload;
        const form = (0, lodash_1.defaultsDeep)(options, {
            supported_capabilities_new: JSON.stringify(this.client.state.supportedCapabilities),
            timezone_offset: '0',
            _csrftoken: this.client.state.cookieCsrfToken,
            client_shared_at: now.toString(),
            configure_mode: '1',
            source_type: '3',
            video_result: '',
            _uid: this.client.state.cookieUserId,
            date_time_original: new Date().toISOString().replace(/[-:]/g, ''),
            device_id: this.client.state.deviceId,
            _uuid: this.client.state.uuid,
            device: devicePayload,
            clips: [
                {
                    length: options.length,
                    source_type: '3',
                },
            ],
            extra: {
                source_width: options.width,
                source_height: options.height,
            },
            audio_muted: false,
            poster_frame_index: 0,
        });
        form.source_type = '3';
        if (form.configure_mode === '1') {
            MediaRepository.stringifyStoryStickers(form);
        }
        else if (form.configure_mode === '2') {
            if (typeof form.recipient_users !== 'string') {
                form.recipient_users = JSON.stringify(form.recipient_users ? [form.recipient_users.map(x => Number(x))] : []);
            }
            form.thread_ids = JSON.stringify(form.thread_ids || []);
        }
        const { body } = await this.client.request.send({
            url: '/api/v1/media/configure_to_story/',
            method: 'POST',
            qs: {
                video: '1',
            },
            form: this.client.request.sign(form),
        });
        return body;
    }
    async configureSidecar(options) {
        const isVideo = (arg) => arg.length !== undefined;
        const devicePayload = this.client.state.devicePayload;
        const sidecarId = options.upload_id || Date.now().toString();
        const now = luxon_1.DateTime.local().toFormat('yyyy:mm:dd HH:mm:ss');
        options = (0, lodash_1.defaultsDeep)(options, {
            _csrftoken: this.client.state.cookieCsrfToken,
            _uid: this.client.state.cookieUserId,
            _uuid: this.client.state.uuid,
            timezone_offset: '0',
            source_type: '4',
            device_id: this.client.state.deviceId,
            caption: '',
            client_sidecar_id: sidecarId,
            upload_id: sidecarId,
            device: devicePayload,
        });
        options.children_metadata = options.children_metadata.map(item => {
            const { width, height } = item;
            item = (0, lodash_1.defaultsDeep)(item, {
                timezone_offset: '0',
                caption: null,
                source_type: '4',
                extra: { source_width: width, source_height: height },
                edits: { crop_original_size: [width, height], crop_center: [0.0, -0.0], crop_zoom: 1.0 },
                device: devicePayload,
            });
            if (typeof item.extra !== 'string') {
                item.extra = JSON.stringify(item.extra);
            }
            if (typeof item.edits !== 'string') {
                item.edits = JSON.stringify(item.edits);
            }
            if (typeof item.device !== 'string') {
                item.device = JSON.stringify(item.device);
            }
            if (item.usertags && typeof item.usertags !== 'string') {
                item.usertags = JSON.stringify(item.usertags);
            }
            if (isVideo(item)) {
                item = (0, lodash_1.defaultsDeep)(item, {
                    filter_type: '0',
                    video_result: '',
                    date_time_original: now,
                    audio_muted: 'false',
                    clips: [{ length: item.length, source_type: '4' }],
                    poster_frame_index: '0',
                });
                const clips = item;
                if (typeof clips !== 'string') {
                    item.clips = JSON.stringify(clips);
                }
            }
            return item;
        });
        if (typeof options.location !== 'string') {
            options.location = JSON.stringify(options.location);
        }
        const { body } = await this.client.request.send({
            url: '/api/v1/media/configure_sidecar/',
            method: 'POST',
            form: this.client.request.sign(options),
        });
        return body;
    }
    async configureToIgtv(options) {
        const form = (0, lodash_1.defaultsDeep)(options, {
            caption: '',
            date_time_original: new Date().toISOString().replace(/[-:]/g, ''),
            igtv_share_preview_to_feed: '0',
            clips: [
                {
                    length: options.length,
                    source_type: options.source_type || '4',
                },
            ],
            audio_muted: false,
            poster_frame_index: 0,
            filter_type: '0',
            timezone_offset: this.client.state.timezoneOffset,
            media_folder: options.source_type !== '4' ? 'Camera' : undefined,
            source_type: '4',
            device: this.client.state.devicePayload,
            retryContext: { num_step_auto_retry: 0, num_reupload: 0, num_step_manual_retry: 0 },
        });
        const retryContext = options.retryContext;
        delete form.retryContext;
        const { body } = await this.client.request.send({
            url: '/api/v1/media/configure_to_igtv/',
            method: 'POST',
            qs: {
                video: '1',
            },
            headers: {
                is_igtv_video: '1',
                retry_context: JSON.stringify(retryContext),
            },
            form: this.client.request.sign(Object.assign(Object.assign({}, form), { _csrftoken: this.client.state.cookieCsrfToken, _uid: this.client.state.cookieUserId, _uuid: this.client.state.uuid })),
        });
        return body;
    }
    async onlyMe(mediaId) {
        const { body } = await this.client.request.send({
            url: `/api/v1/media/${mediaId}/only_me/`,
            method: 'POST',
            form: this.client.request.sign({
                media_id: mediaId,
                _csrftoken: this.client.state.cookieCsrfToken,
                _uid: this.client.state.cookieUserId,
                _uuid: this.client.state.uuid,
            }),
        });
        return body;
    }
    async undoOnlyMe(mediaId) {
        const { body } = await this.client.request.send({
            url: `/api/v1/media/${mediaId}/undo_only_me/`,
            method: 'POST',
            form: this.client.request.sign({
                media_id: mediaId,
                _csrftoken: this.client.state.cookieCsrfToken,
                _uid: this.client.state.cookieUserId,
                _uuid: this.client.state.uuid,
            }),
        });
        return body;
    }
    async seen(reels, module = 'feed_timeline') {
        const { body } = await this.client.request.send({
            url: `/api/v2/media/seen/`,
            method: 'POST',
            qs: {
                reel: 1,
                live_vod: 0,
            },
            form: this.client.request.sign({
                reels,
                container_module: module,
                reel_media_skipped: [],
                live_vods: [],
                live_vods_skipped: [],
                nuxes: [],
                nuxes_skipped: [],
                _uuid: this.client.state.uuid,
                _uid: this.client.state.cookieUserId,
                _csrftoken: this.client.state.cookieCsrfToken,
                device_id: this.client.state.deviceId,
            }),
        });
        return body;
    }
    async save(mediaId, collection_ids) {
        const { body } = await this.client.request.send({
            url: `/api/v1/media/${mediaId}/save/`,
            method: 'POST',
            form: this.client.request.sign({
                added_collection_ids: collection_ids ? JSON.stringify(collection_ids) : undefined,
                _uuid: this.client.state.uuid,
                _uid: this.client.state.cookieUserId,
                _csrftoken: this.client.state.cookieCsrfToken,
                device_id: this.client.state.deviceId,
            }),
        });
        return body;
    }
    async unsave(mediaId) {
        const { body } = await this.client.request.send({
            url: `/api/v1/media/${mediaId}/unsave/`,
            method: 'POST',
        });
        return body;
    }
    async storyPollVote(mediaId, pollId, vote) {
        const { body } = await this.client.request.send({
            url: `/api/v1/media/${mediaId}/${pollId}/story_poll_vote/`,
            method: 'POST',
            form: this.client.request.sign({
                _csrftoken: this.client.state.cookieCsrfToken,
                radio_type: this.client.state.radioType,
                _uid: this.client.state.cookieUserId,
                vote,
                _uuid: this.client.state.uuid,
            }),
        });
        return body;
    }
    async storyQuestionResponse(mediaId, questionId, options) {
        const chance = new Chance();
        if (typeof options.response === 'undefined') {
            options = (0, lodash_1.defaultsDeep)(options, { music_browse_session_id: chance.guid({ version: 4 }) });
        }
        const { body } = await this.client.request.send({
            url: `/api/v1/media/${mediaId}/${questionId}/story_question_response/`,
            method: 'POST',
            form: this.client.request.sign(Object.assign({ client_context: chance.guid({ version: 4 }), mutation_token: chance.guid({ version: 4 }), _csrftoken: this.client.state.cookieCsrfToken, _uid: this.client.state.cookieUserId, _uuid: this.client.state.uuid }, options)),
        });
        return body;
    }
    async storySliderVote(mediaId, sliderId, vote) {
        const { body } = await this.client.request.send({
            url: `/api/v1/media/${mediaId}/${sliderId}/story_slider_vote/`,
            method: 'POST',
            form: this.client.request.sign({
                _csrftoken: this.client.state.cookieCsrfToken,
                _uid: this.client.state.cookieUserId,
                _uuid: this.client.state.uuid,
                vote: vote.toFixed(8),
            }),
        });
        return body;
    }
    async storyQuizAnswer(mediaId, quizId, answer) {
        const { body } = await this.client.request.send({
            url: `/api/v1/media/${mediaId}/${quizId}/story_quiz_answer/`,
            method: 'POST',
            form: this.client.request.sign({
                _csrftoken: this.client.state.cookieCsrfToken,
                _uuid: this.client.state.uuid,
                answer,
            }),
        });
        return body;
    }
    async storyCountdownAction(countdownId, action) {
        const { body } = await this.client.request.send({
            url: `/api/v1/media/${countdownId}/${action}/`,
            method: 'POST',
            form: this.client.request.sign({
                _csrftoken: this.client.state.cookieCsrfToken,
                _uid: this.client.state.cookieUserId,
                _uuid: this.client.state.uuid
            }),
        });
        return body;
    }
    async storyCountdownFollow(countdownId) {
        return this.storyCountdownAction(countdownId, 'follow_story_countdown');
    }
    async storyCountdownUnfollow(countdownId) {
        return this.storyCountdownAction(countdownId, 'unfollow_story_countdown');
    }
}
exports.MediaRepository = MediaRepository;
//# sourceMappingURL=media.repository.js.map