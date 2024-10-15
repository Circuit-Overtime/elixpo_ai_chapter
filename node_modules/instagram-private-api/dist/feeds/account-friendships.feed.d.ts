import { Feed } from '../core/feed';
import { PendingFriendshipsFeedResponse, PendingFriendshipsFeedResponseUsersItem } from '../responses';
export declare class PendingFriendshipsFeed extends Feed<PendingFriendshipsFeedResponse, PendingFriendshipsFeedResponseUsersItem> {
    private nextMaxId;
    set state(body: PendingFriendshipsFeedResponse);
    request(): Promise<PendingFriendshipsFeedResponse>;
    items(): Promise<PendingFriendshipsFeedResponseUsersItem[]>;
}
