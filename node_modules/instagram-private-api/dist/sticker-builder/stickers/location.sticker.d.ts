import { InstaSticker } from './insta-sticker';
export declare class LocationSticker extends InstaSticker {
    locationId: string;
    width: number;
    height: number;
    get id(): string;
    get key(): string;
}
