import { Repository } from '../core/repository';
import { MediaEditResponseRootObject, MediaInfoResponseRootObject, MediaRepositoryLikersResponseRootObject, MediaUpdatedMediaResponseRootObject, StatusResponse } from '../responses';
import { IgAppModule, LikeRequestOptions, UnlikeRequestOptions, MediaConfigureStoryPhotoOptions, MediaConfigureStoryVideoOptions, MediaConfigureTimelineOptions, MediaConfigureSidecarOptions, MediaConfigureTimelineVideoOptions, MediaConfigureToIgtvOptions } from '../types';
import { MediaRepositoryConfigureResponseRootObject } from '../responses';
import { MediaRepositoryCheckOffensiveCommentResponseRootObject } from '../responses';
import { StoryMusicQuestionResponse, StoryTextQuestionResponse } from '../types/story-response.options';
export declare class MediaRepository extends Repository {
    info(mediaId: string): Promise<MediaInfoResponseRootObject>;
    editMedia({ mediaId, captionText, }: {
        mediaId: string;
        captionText: string;
    }): Promise<MediaEditResponseRootObject>;
    delete({ mediaId, mediaType, }: {
        mediaId: string;
        mediaType?: 'PHOTO' | 'VIDEO' | 'CAROUSEL';
    }): Promise<any>;
    private likeAction;
    like(options: LikeRequestOptions): Promise<any>;
    unlike(options: UnlikeRequestOptions): Promise<any>;
    likeComment(commentId: string): Promise<any>;
    unlikeComment(commentId: string): Promise<any>;
    checkOffensiveComment(commentText: string, mediaId?: string): Promise<MediaRepositoryCheckOffensiveCommentResponseRootObject>;
    commentsBulkDelete(mediaId: string, commentIds: string[]): Promise<StatusResponse>;
    comment({ mediaId, text, replyToCommentId, module, }: {
        mediaId: string;
        text: string;
        replyToCommentId?: string;
        module?: string;
    }): Promise<import("../responses").MediaRepositoryCommentResponseComment>;
    commentsDisable(mediaId: any): Promise<any>;
    commentsEnable(mediaId: any): Promise<any>;
    likers(id: string): Promise<MediaRepositoryLikersResponseRootObject>;
    blocked(): Promise<string[]>;
    uploadFinish(options: {
        upload_id: string;
        source_type: string;
        video?: {
            length: number;
            clips?: Array<{
                length: number;
                source_type: string;
            }>;
            poster_frame_index?: number;
            audio_muted?: boolean;
        };
    }): Promise<any>;
    private applyConfigureDefaults;
    configure(options: MediaConfigureTimelineOptions): Promise<MediaRepositoryConfigureResponseRootObject>;
    configureVideo(options: MediaConfigureTimelineVideoOptions): Promise<MediaRepositoryConfigureResponseRootObject>;
    private static stringifyStoryStickers;
    configureToStory(options: MediaConfigureStoryPhotoOptions): Promise<any>;
    configureToStoryVideo(options: MediaConfigureStoryVideoOptions): Promise<any>;
    configureSidecar(options: MediaConfigureSidecarOptions): Promise<any>;
    configureToIgtv(options: MediaConfigureToIgtvOptions): Promise<any>;
    onlyMe(mediaId: string): Promise<StatusResponse>;
    undoOnlyMe(mediaId: string): Promise<StatusResponse>;
    seen(reels: {
        [item: string]: [string];
    }, module?: IgAppModule): Promise<StatusResponse>;
    save(mediaId: string, collection_ids?: string[]): Promise<any>;
    unsave(mediaId: string): Promise<any>;
    storyPollVote(mediaId: string, pollId: string | number, vote: '0' | '1'): Promise<MediaUpdatedMediaResponseRootObject>;
    storyQuestionResponse(mediaId: string, questionId: string | number, options: StoryTextQuestionResponse | StoryMusicQuestionResponse): Promise<StatusResponse>;
    storySliderVote(mediaId: string, sliderId: string | number, vote: number): Promise<MediaUpdatedMediaResponseRootObject>;
    storyQuizAnswer(mediaId: string, quizId: string | number, answer: '0' | '1' | '2' | '3' | string): Promise<MediaUpdatedMediaResponseRootObject>;
    private storyCountdownAction;
    storyCountdownFollow(countdownId: string | number): Promise<StatusResponse>;
    storyCountdownUnfollow(countdownId: string | number): Promise<StatusResponse>;
}
