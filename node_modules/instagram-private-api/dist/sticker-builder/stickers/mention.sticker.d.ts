import { InstaSticker } from './insta-sticker';
export declare class MentionSticker extends InstaSticker {
    userId: string;
    displayType?: 'mention_username' | 'mention_reshare';
    mediaId?: string;
    width: number;
    height: number;
    get id(): string;
    get key(): string;
    get additionalConfigureProperties(): any;
}
