import { Feed } from '../core/feed';
import { DiscoverFeedResponseRootObject, DiscoverFeedResponseUser } from '../responses';
export declare class DiscoverFeed extends Feed<DiscoverFeedResponseRootObject, DiscoverFeedResponseUser> {
    private nextMaxId;
    set state(body: DiscoverFeedResponseRootObject);
    request(): Promise<DiscoverFeedResponseRootObject>;
    items(): Promise<DiscoverFeedResponseUser[]>;
}
