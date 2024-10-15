import { Repository } from '../core/repository';
export declare class SimulateService extends Repository {
    private get preLoginFlowRequests();
    private get postLoginFlowRequests();
    private static executeRequestsFlow;
    preLoginFlow(concurrency?: number, toShuffle?: boolean): Promise<void>;
    postLoginFlow(concurrency?: number, toShuffle?: boolean): Promise<void>;
    private facebookOta;
}
