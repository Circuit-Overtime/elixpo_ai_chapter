import { Feed } from '../core/feed';
import { AccountFollowingFeedResponse, AccountFollowingFeedResponseUsersItem } from '../responses';
export declare class AccountFollowingFeed extends Feed<AccountFollowingFeedResponse, AccountFollowingFeedResponseUsersItem> {
    searchSurface?: string;
    order?: 'default' | 'date_followed_latest' | 'date_followed_earliest';
    query: string;
    enableGroups: boolean;
    includesHashtags: boolean;
    id: number | string;
    nextMaxId: string;
    set state(body: AccountFollowingFeedResponse);
    request(): Promise<AccountFollowingFeedResponse>;
    items(): Promise<AccountFollowingFeedResponseUsersItem[]>;
}
