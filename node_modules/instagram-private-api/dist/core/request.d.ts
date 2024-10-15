import { Subject } from 'rxjs';
import { AttemptOptions } from '@lifeomic/attempt';
import { Options } from 'request';
import { IgApiClient } from './client';
import { IgClientError } from '../errors';
import { IgResponse } from '../types';
declare type Payload = {
    [key: string]: any;
} | string;
interface SignedPost {
    signed_body: string;
    ig_sig_key_version: string;
}
export declare class Request {
    private client;
    private static requestDebug;
    end$: Subject<unknown>;
    error$: Subject<IgClientError>;
    attemptOptions: Partial<AttemptOptions<any>>;
    defaults: Partial<Options>;
    constructor(client: IgApiClient);
    private static requestTransform;
    send<T = any>(userOptions: Options, onlyCheckHttpStatus?: boolean): Promise<IgResponse<T>>;
    private updateState;
    signature(data: string): string;
    sign(payload: Payload): SignedPost;
    userBreadcrumb(size: number): string;
    private handleResponseError;
    protected faultTolerantRequest(options: Options): Promise<any>;
    getDefaultHeaders(): {
        'User-Agent': string;
        'X-Ads-Opt-Out': string;
        'X-CM-Bandwidth-KBPS': string;
        'X-CM-Latency': string;
        'X-IG-App-Locale': string;
        'X-IG-Device-Locale': string;
        'X-Pigeon-Session-Id': string;
        'X-Pigeon-Rawclienttime': string;
        'X-IG-Connection-Speed': string;
        'X-IG-Bandwidth-Speed-KBPS': string;
        'X-IG-Bandwidth-TotalBytes-B': string;
        'X-IG-Bandwidth-TotalTime-MS': string;
        'X-IG-EU-DC-ENABLED': string;
        'X-IG-Extended-CDN-Thumbnail-Cache-Busting-Value': string;
        'X-Bloks-Version-Id': string;
        'X-MID': string;
        'X-IG-WWW-Claim': string;
        'X-Bloks-Is-Layout-RTL': string;
        'X-IG-Connection-Type': string;
        'X-IG-Capabilities': string;
        'X-IG-App-ID': string;
        'X-IG-Device-ID': string;
        'X-IG-Android-ID': string;
        'Accept-Language': string;
        'X-FB-HTTP-Engine': string;
        Authorization: string;
        Host: string;
        'Accept-Encoding': string;
        Connection: string;
    };
}
export {};
