import { Feed } from '../core/feed';
import { IgtvBrowseFeedResponseBrowseItemsItem, IgtvBrowseFeedResponseRootObject } from '../responses';
export declare class IgtvBrowseFeed extends Feed<IgtvBrowseFeedResponseRootObject, IgtvBrowseFeedResponseBrowseItemsItem> {
    isPrefetch: boolean;
    private maxId;
    items(): Promise<IgtvBrowseFeedResponseBrowseItemsItem[]>;
    request(): Promise<IgtvBrowseFeedResponseRootObject>;
    protected set state(response: any);
}
