import { InstaSticker } from './insta-sticker';
export declare class ChatSticker extends InstaSticker {
    text: string;
    startBackgroundColor?: string;
    endBackgroundColor?: string;
    hasStartedChat?: boolean;
    width: number;
    height: number;
    get id(): string;
    get key(): string;
}
