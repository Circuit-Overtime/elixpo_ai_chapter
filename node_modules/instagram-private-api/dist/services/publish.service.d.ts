/// <reference types="node" />
import { Repository } from '../core/repository';
import { PostingAlbumOptions, PostingPhotoOptions, PostingStoryPhotoOptions, PostingStoryVideoOptions, PostingVideoOptions } from '../types';
import { PostingIgtvOptions } from '../types/posting.igtv.options';
import Bluebird = require('bluebird');
export declare class PublishService extends Repository {
    private static publishDebug;
    private chance;
    static catchTranscodeError(videoInfo: any, transcodeDelayInMs: number): (error: any) => Bluebird<void>;
    static getVideoInfo(buffer: Buffer): {
        duration: number;
        width: number;
        height: number;
    };
    static getMP4Duration(buffer: Buffer): number;
    private static makeLocationOptions;
    private static read32;
    private static read16;
    photo(options: PostingPhotoOptions): Promise<import("../responses").MediaRepositoryConfigureResponseRootObject>;
    video(options: PostingVideoOptions): Promise<import("../responses").MediaRepositoryConfigureResponseRootObject>;
    album(options: PostingAlbumOptions): Promise<any>;
    story(options: PostingStoryPhotoOptions | PostingStoryVideoOptions): Promise<any>;
    igtvVideo(options: PostingIgtvOptions): Promise<any>;
    private regularVideo;
    private segmentedVideo;
    private uploadAndConfigureStoryPhoto;
    private uploadAndConfigureStoryVideo;
}
