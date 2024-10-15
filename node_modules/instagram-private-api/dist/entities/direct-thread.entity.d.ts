/// <reference types="node" />
import { Entity } from '../core/entity';
import { DirectThreadBroadcastPhotoOptions, DirectThreadBroadcastPhotoStoryOptions, DirectThreadBroadcastReelOptions, DirectThreadBroadcastVideoOptions, DirectThreadBroadcastVideoStoryOptions, DirectThreadBroadcastVoiceOptions } from '../types';
export declare class DirectThreadEntity extends Entity {
    threadId: string;
    userIds: string[];
    deleteItem(itemId: string | number): Promise<import("..").StatusResponse>;
    broadcastText(text: string, skipLinkCheck?: boolean): Promise<import("..").DirectThreadRepositoryBroadcastResponseRootObject | import("..").DirectThreadRepositoryBroadcastResponsePayload>;
    broadcastReel(options: DirectThreadBroadcastReelOptions): Promise<import("..").DirectThreadRepositoryBroadcastResponseRootObject | import("..").DirectThreadRepositoryBroadcastResponsePayload>;
    broadcastUserStory(options: DirectThreadBroadcastReelOptions): Promise<import("..").DirectThreadRepositoryBroadcastResponseRootObject | import("..").DirectThreadRepositoryBroadcastResponsePayload>;
    broadcastProfile(id: number | string): Promise<import("..").DirectThreadRepositoryBroadcastResponseRootObject | import("..").DirectThreadRepositoryBroadcastResponsePayload>;
    broadcastLink(link_text: string, link_urls: string[]): Promise<import("..").DirectThreadRepositoryBroadcastResponseRootObject | import("..").DirectThreadRepositoryBroadcastResponsePayload>;
    broadcastPhoto(options: DirectThreadBroadcastPhotoOptions): Promise<import("..").DirectThreadRepositoryBroadcastResponseRootObject | import("..").DirectThreadRepositoryBroadcastResponsePayload>;
    broadcastPost(mediaId: string): Promise<import("..").DirectThreadRepositoryBroadcastResponseRootObject | import("..").DirectThreadRepositoryBroadcastResponsePayload>;
    broadcastVideo(options: DirectThreadBroadcastVideoOptions): Promise<import("..").DirectThreadRepositoryBroadcastResponseRootObject | import("..").DirectThreadRepositoryBroadcastResponsePayload>;
    broadcastVoice(options: DirectThreadBroadcastVoiceOptions): Promise<import("..").DirectThreadRepositoryBroadcastResponseRootObject | import("..").DirectThreadRepositoryBroadcastResponsePayload>;
    broadcastStory(input: Buffer | DirectThreadBroadcastPhotoStoryOptions | DirectThreadBroadcastVideoStoryOptions): Promise<any>;
    updateTitle(title: string): Promise<import("..").DirectThreadRepositoryUpdateTitleResponseRootObject>;
    mute(): Promise<import("..").StatusResponse>;
    unmute(): Promise<import("..").StatusResponse>;
    hide(): Promise<import("..").StatusResponse>;
    leave(): Promise<import("..").StatusResponse>;
    addUser(userIds: string[] | number[]): Promise<import("..").DirectThreadRepositoryAddUserResponseRootObject>;
    markItemSeen(threadItemId: string): Promise<import("..").StatusResponse>;
    private broadcast;
}
