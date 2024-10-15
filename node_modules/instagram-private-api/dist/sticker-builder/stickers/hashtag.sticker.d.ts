import { InstaSticker } from './insta-sticker';
export declare class HashtagSticker extends InstaSticker {
    tagName: string;
    width: number;
    height: number;
    get id(): string;
    get key(): string;
}
