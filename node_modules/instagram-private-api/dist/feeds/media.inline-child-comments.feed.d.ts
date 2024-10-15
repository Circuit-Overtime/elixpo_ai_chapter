import { Feed } from '../core/feed';
import { MediaInlineChildCommentsFeedResponseChildCommentsItem, MediaInlineChildCommentsFeedResponseRootObject } from '../responses/media.inline-child-comments.feed.response';
export declare class MediaInlineChildCommentsFeed extends Feed<MediaInlineChildCommentsFeedResponseRootObject, MediaInlineChildCommentsFeedResponseChildCommentsItem> {
    mediaId: string;
    commentId: string;
    private nextMaxId;
    private nextMinId?;
    set state(state: MediaInlineChildCommentsFeedResponseRootObject);
    request(): Promise<MediaInlineChildCommentsFeedResponseRootObject>;
    items(): Promise<MediaInlineChildCommentsFeedResponseChildCommentsItem[]>;
}
