import { Feed } from '../core/feed';
import { ListReelMediaViewerFeedResponseRootObject, ListReelMediaViewerFeedResponseUsersItem } from '../responses';
export declare class ListReelMediaViewerFeed extends Feed<ListReelMediaViewerFeedResponseRootObject, ListReelMediaViewerFeedResponseUsersItem> {
    private mediaId;
    private nextMaxId?;
    items(): Promise<ListReelMediaViewerFeedResponseUsersItem[]>;
    protected set state(response: ListReelMediaViewerFeedResponseRootObject);
    request(): Promise<ListReelMediaViewerFeedResponseRootObject>;
    isMoreAvailable(): boolean;
}
