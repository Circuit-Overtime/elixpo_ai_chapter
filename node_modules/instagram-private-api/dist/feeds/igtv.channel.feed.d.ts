import { Feed } from '../core/feed';
import { IgtvChannelFeedResponseItemsItem, IgtvChannelFeedResponseRootObject } from '../responses/igtv.channel.feed.response';
export declare class IgtvChannelFeed extends Feed<IgtvChannelFeedResponseRootObject, IgtvChannelFeedResponseItemsItem> {
    channelId: string;
    private maxId;
    protected set state(response: IgtvChannelFeedResponseRootObject);
    request(): Promise<IgtvChannelFeedResponseRootObject>;
    items(): Promise<IgtvChannelFeedResponseItemsItem[]>;
}
