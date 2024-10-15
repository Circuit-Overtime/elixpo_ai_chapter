import { Feed } from '../core/feed';
export declare class MediaStickerResponsesFeed<T, I> extends Feed<T, I> {
    name: string;
    rootName: string;
    itemName: string;
    stickerId: string;
    mediaId: string;
    private maxId;
    items(): Promise<I[]>;
    request(): Promise<T>;
    protected set state(response: T);
}
