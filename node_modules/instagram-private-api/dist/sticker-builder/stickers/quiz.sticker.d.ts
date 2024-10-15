import { InstaSticker } from './insta-sticker';
declare type Options = Array<{
    text: string;
    count: number;
}>;
export declare class QuizSticker extends InstaSticker {
    private _options;
    question: string;
    set options(value: string[] | Options);
    get options(): string[] | Options;
    correctAnswer: number;
    textColor?: string;
    startBackgroundColor?: string;
    endBackgroundColor?: string;
    viewerCanAnswer?: boolean;
    viewerAnswer?: number;
    width: number;
    height: number;
    get id(): string;
    get key(): string;
}
export {};
