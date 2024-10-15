import { Feed } from '../core/feed';
import { IgAppModule } from '../types';
import { TopicalExploreFeedResponseRootObject, TopicalExploreFeedResponseSectionalItemsItem } from '../responses';
export declare class TopicalExploreFeed extends Feed<TopicalExploreFeedResponseRootObject, TopicalExploreFeedResponseSectionalItemsItem> {
    module: IgAppModule;
    lat?: string | number;
    lng?: string | number;
    clusterId: string;
    sessionId: string;
    private nextMaxId;
    set state(body: TopicalExploreFeedResponseRootObject);
    items(): Promise<TopicalExploreFeedResponseSectionalItemsItem[]>;
    request(): Promise<TopicalExploreFeedResponseRootObject>;
}
