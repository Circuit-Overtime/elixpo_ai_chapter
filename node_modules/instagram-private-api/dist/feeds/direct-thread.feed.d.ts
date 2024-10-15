import { Feed } from '../core/feed';
import { DirectThreadFeedResponse, DirectThreadFeedResponseItemsItem } from '../responses';
export declare class DirectThreadFeed extends Feed<DirectThreadFeedResponse, DirectThreadFeedResponseItemsItem> {
    id: string;
    seqId: number;
    cursor: string;
    set state(body: DirectThreadFeedResponse);
    request(): Promise<DirectThreadFeedResponse>;
    items(): Promise<DirectThreadFeedResponseItemsItem[]>;
}
