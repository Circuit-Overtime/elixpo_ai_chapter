import { Repository } from '../core/repository';
import { AccountInsightsOptions } from '../types';
import { InsightsServiceAccountResponseRootObject } from '../responses/insights.service.account.response';
import { InsightsServicePostResponseRootObject, StoriesInsightsFeedResponseRootObject } from '../responses';
export declare class InsightsService extends Repository {
    account(options: AccountInsightsOptions): Promise<InsightsServiceAccountResponseRootObject>;
    post(mediaId: string): Promise<InsightsServicePostResponseRootObject>;
    igtv(mediaId: string): Promise<{
        data: any;
    }>;
    story(storyId: string): Promise<StoriesInsightsFeedResponseRootObject>;
}
