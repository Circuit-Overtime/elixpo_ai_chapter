/// <reference types="node" />
import { IgApiClient } from '..';
export interface UploadVideoOptions {
    video: Buffer;
    uploadId?: string;
    duration: number;
    width?: number;
    height?: number;
    isSidecar?: boolean;
    forAlbum?: boolean;
    isDirect?: boolean;
    isDirectVoice?: boolean;
    mediaType?: string;
    forDirectStory?: boolean;
    isIgtvVideo?: boolean;
    waterfallId?: string;
    uploadName?: string;
    offset?: number;
}
export interface UploadVideoSegmentInitOptions {
    waterfallId: string;
    ruploadParams: any;
    transferId: string;
    streamId: string;
    startOffset: number;
}
export interface UploadVideoSegmentTransferOptions {
    waterfallId: string;
    ruploadParams: any;
    transferId: string;
    streamId: string;
    startOffset: number;
    segment: Buffer;
}
export declare type SegmentDivider = (options: {
    buffer: Buffer;
    client: IgApiClient;
}) => Buffer[];
export interface UploadSegmentedVideoOptions extends UploadVideoOptions {
    segmentDivider?: SegmentDivider;
    retryContext?: UploadRetryContext;
    segments?: Buffer[];
}
export interface UploadRetryContext {
    num_step_auto_retry: number;
    num_reupload: number;
    num_step_manual_retry: number;
}
export declare const SEGMENT_DIVIDERS: {
    totalSections(numSections: any): SegmentDivider;
    sectionSize(sectionSize: any): SegmentDivider;
};
