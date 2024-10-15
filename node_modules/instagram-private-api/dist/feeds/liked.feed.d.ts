import { Feed } from '../core/feed';
import { LikedFeedResponseItemsItem, LikedFeedResponseRootObject } from '../responses';
export declare class LikedFeed extends Feed<LikedFeedResponseRootObject, LikedFeedResponseItemsItem> {
    private maxId;
    items(): Promise<LikedFeedResponseItemsItem[]>;
    request(): Promise<LikedFeedResponseRootObject>;
    protected set state(response: LikedFeedResponseRootObject);
}
