import { Repository } from '../core/repository';
import { UploadRepositoryPhotoResponseRootObject } from '../responses';
import { UploadRetryContext, UploadVideoOptions, UploadPhotoOptions, UploadVideoSegmentInitOptions, UploadVideoSegmentTransferOptions } from '../types';
export declare class UploadRepository extends Repository {
    private static uploadDebug;
    private chance;
    photo(options: UploadPhotoOptions): Promise<UploadRepositoryPhotoResponseRootObject>;
    video(options: UploadVideoOptions): Promise<any>;
    initVideo({ name, ruploadParams, waterfallId }: {
        name: any;
        ruploadParams: any;
        waterfallId: any;
    }): Promise<{
        offset: number;
    }>;
    startSegmentedVideo(ruploadParams: any): Promise<{
        stream_id: string;
    }>;
    videoSegmentInit(options: UploadVideoSegmentInitOptions): Promise<{
        offset: number;
    }>;
    videoSegmentTransfer(options: UploadVideoSegmentTransferOptions): Promise<any>;
    endSegmentedVideo({ ruploadParams, streamId }: {
        ruploadParams: any;
        streamId: any;
    }): Promise<any>;
    private getBaseHeaders;
    private static createPhotoRuploadParams;
    static createVideoRuploadParams(options: UploadVideoOptions, uploadId: number | string, retryContext?: UploadRetryContext): any;
}
