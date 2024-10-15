import { InstaSticker } from './insta-sticker';
export declare class AttachmentSticker extends InstaSticker {
    mediaId: string;
    mediaOwnerId: string;
    width: number;
    height: number;
    get id(): string;
    get key(): string;
    get additionalConfigureProperties(): any;
}
