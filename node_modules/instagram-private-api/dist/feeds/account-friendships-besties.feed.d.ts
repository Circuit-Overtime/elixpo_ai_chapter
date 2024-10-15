import { Feed } from '../core/feed';
import { BestiesFeedResponse, BestiesFeedResponseUsersItem } from '../responses';
export declare class BestiesFeed extends Feed<BestiesFeedResponse, BestiesFeedResponseUsersItem> {
    private nextMaxId;
    set state(body: BestiesFeedResponse);
    request(): Promise<BestiesFeedResponse>;
    items(): Promise<BestiesFeedResponseUsersItem[]>;
}
