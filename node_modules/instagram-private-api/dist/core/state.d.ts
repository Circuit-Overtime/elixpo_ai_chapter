/// <reference types="request" />
import { Cookie, CookieJar, MemoryCookieStore } from 'tough-cookie';
import * as Constants from './constants';
import { ChallengeStateResponse, CheckpointResponse } from '../responses';
declare const AUTHORIZATION_TAG: unique symbol;
interface ParsedAuthorization {
    ds_user_id: string;
    sessionid: string;
    should_use_header_over_cookie: string;
    [AUTHORIZATION_TAG]: string;
}
export declare class State {
    private static stateDebug;
    get signatureKey(): string;
    get signatureVersion(): string;
    get userBreadcrumbKey(): string;
    get appVersion(): string;
    get appVersionCode(): string;
    get fbAnalyticsApplicationId(): string;
    get fbOtaFields(): string;
    get fbOrcaApplicationId(): string;
    get loginExperiments(): string;
    get experiments(): string;
    get bloksVersionId(): string;
    constants: typeof Constants;
    supportedCapabilities: ({
        name: string;
        value: string;
    } | {
        name: string;
        value: number;
    })[];
    language: string;
    timezoneOffset: string;
    radioType: string;
    capabilitiesHeader: string;
    connectionTypeHeader: string;
    isLayoutRTL: boolean;
    euDCEnabled?: boolean;
    adsOptOut: boolean;
    thumbnailCacheBustingValue: number;
    igWWWClaim?: string;
    authorization?: string;
    passwordEncryptionPubKey?: string;
    passwordEncryptionKeyId?: string | number;
    deviceString: string;
    build: string;
    uuid: string;
    phoneId: string;
    adid: string;
    deviceId: string;
    proxyUrl: string;
    cookieStore: MemoryCookieStore;
    cookieJar: import("request").CookieJar;
    checkpoint: CheckpointResponse | null;
    challenge: ChallengeStateResponse | null;
    clientSessionIdLifetime: number;
    pigeonSessionIdLifetime: number;
    parsedAuthorization?: ParsedAuthorization;
    get clientSessionId(): string;
    get pigeonSessionId(): string;
    get appUserAgent(): string;
    get webUserAgent(): string;
    get devicePayload(): {
        android_version: string;
        android_release: string;
        manufacturer: string;
        model: string;
    };
    get batteryLevel(): number;
    get isCharging(): boolean;
    get challengeUrl(): string;
    get cookieCsrfToken(): string;
    get cookieUserId(): string;
    get cookieUsername(): string;
    isExperimentEnabled(experiment: any): boolean;
    extractCookie(key: string): Cookie | null;
    extractCookieValue(key: string): string;
    extractUserId(): string;
    deserializeCookieJar(cookies: string | CookieJar.Serialized): Promise<void>;
    serializeCookieJar(): Promise<CookieJar.Serialized>;
    serialize(): Promise<{
        constants: any;
        cookies: any;
    } & any>;
    deserialize(state: string | any): Promise<void>;
    generateDevice(seed: string): void;
    private generateTemporaryGuid;
    private hasValidAuthorization;
    private updateAuthorization;
}
export {};
