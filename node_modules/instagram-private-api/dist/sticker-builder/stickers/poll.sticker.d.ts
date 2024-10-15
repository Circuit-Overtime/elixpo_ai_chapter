import { InstaSticker } from './insta-sticker';
export interface PollStickerTallie {
    text: string;
    fontSize?: number;
}
declare type Tallies = [PollStickerTallie, PollStickerTallie];
export declare class PollSticker extends InstaSticker {
    private _tallies;
    get tallies(): Tallies;
    set tallies(value: Tallies);
    question: string;
    finished?: boolean;
    viewerVote?: number;
    viewerCanVote?: boolean;
    isSharedResult?: boolean;
    width: number;
    height: number;
    get id(): string;
    get key(): string;
}
export {};
