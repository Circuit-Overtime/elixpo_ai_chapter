import { Feed } from '../core/feed';
import { SavedFeedResponseRootObject, SavedFeedResponseMedia } from '../responses';
export declare class SavedFeed extends Feed<SavedFeedResponseRootObject, SavedFeedResponseMedia> {
    private nextMaxId;
    set state(body: SavedFeedResponseRootObject);
    request(): Promise<SavedFeedResponseRootObject>;
    items(): Promise<SavedFeedResponseMedia[]>;
}
