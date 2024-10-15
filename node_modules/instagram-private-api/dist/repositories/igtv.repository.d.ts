import { Repository } from '../core/repository';
import { IgtvWriteSeenStateOptions } from '../types';
import { StatusResponse, IgtvSearchResponseRootObject } from '../responses';
export declare class IgtvRepository extends Repository {
    writeSeenState(options: IgtvWriteSeenStateOptions): Promise<StatusResponse>;
    search(query?: string): Promise<IgtvSearchResponseRootObject>;
    allUserSeries(user: string | number, data?: object): Promise<any>;
    createSeries(title: string, description?: string): Promise<any>;
    seriesAddEpisode(series: string | number, mediaId: string): Promise<any>;
}
