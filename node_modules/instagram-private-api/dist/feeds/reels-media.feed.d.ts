import { Feed } from '../core/feed';
import { ReelsMediaFeedResponseItem, ReelsMediaFeedResponseRootObject } from '../responses';
import { IgAppModule } from '../types/common.types';
export declare class ReelsMediaFeed extends Feed<ReelsMediaFeedResponseRootObject, ReelsMediaFeedResponseItem> {
    userIds: Array<number | string>;
    source: IgAppModule;
    protected set state(body: any);
    request(): Promise<ReelsMediaFeedResponseRootObject>;
    items(): Promise<ReelsMediaFeedResponseItem[]>;
}
