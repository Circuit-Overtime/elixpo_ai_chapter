import { Feed } from '../core/feed';
import { MediaCommentsFeedResponse, MediaCommentsFeedResponseCommentsItem } from '../responses/';
export declare class MediaCommentsFeed extends Feed<MediaCommentsFeedResponse, MediaCommentsFeedResponseCommentsItem> {
    id: string;
    private nextMaxId;
    private nextMinId;
    set state(body: MediaCommentsFeedResponse);
    request(): Promise<MediaCommentsFeedResponse>;
    items(): Promise<MediaCommentsFeedResponseCommentsItem[]>;
}
