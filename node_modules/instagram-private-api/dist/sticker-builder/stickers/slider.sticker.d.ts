import { InstaSticker } from './insta-sticker';
export declare class SliderSticker extends InstaSticker {
    question: string;
    emoji: string;
    backgroundColor?: string;
    textColor?: string;
    viewerCanVote?: boolean;
    sliderVoteCount?: number;
    viewerVote?: number;
    sliderVoteAverage?: number;
    width: number;
    height: number;
    get id(): string;
    get key(): string;
}
