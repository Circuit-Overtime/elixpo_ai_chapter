import { InstaSticker } from './insta-sticker';
import { DateTime } from 'luxon';
export declare class CountdownSticker extends InstaSticker {
    private _endTs;
    get endTs(): DateTime | number;
    set endTs(value: DateTime | number);
    text: string;
    textColor?: string;
    startBackgroundColor?: string;
    endBackgroundColor?: string;
    digitColor?: string;
    digitCardColor?: string;
    followingEnabled?: boolean;
    width: number;
    height: number;
    get id(): string;
    get key(): string;
}
