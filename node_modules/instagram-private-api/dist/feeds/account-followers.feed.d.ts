import { Feed } from '../core/feed';
import { AccountFollowersFeedResponse, AccountFollowersFeedResponseUsersItem } from '../responses';
export declare class AccountFollowersFeed extends Feed<AccountFollowersFeedResponse, AccountFollowersFeedResponseUsersItem> {
    searchSurface?: string;
    order?: 'default';
    query: string;
    enableGroups: boolean;
    id: number | string;
    nextMaxId: string;
    set state(body: AccountFollowersFeedResponse);
    request(): Promise<AccountFollowersFeedResponse>;
    items(): Promise<AccountFollowersFeedResponseUsersItem[]>;
}
