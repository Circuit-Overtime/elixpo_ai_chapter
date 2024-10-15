import { InstaSticker } from './insta-sticker';
export declare class QuestionSticker extends InstaSticker {
    question: string;
    backgroundColor?: string;
    textColor?: string;
    profilePicUrl?: string;
    questionType?: 'text' | 'music';
    viewerCanInteract?: boolean;
    width: number;
    height: number;
    get id(): string;
    get key(): string;
}
