import { Diff } from 'utility-types';
import { AttachmentSticker, ChatSticker, CountdownSticker, HashtagSticker, InstaSticker, LocationSticker, MentionSticker, PollSticker, QuestionSticker, QuizSticker, SliderSticker } from './stickers';
export declare type StickerOptions<T extends InstaSticker> = Diff<T, InstaSticker> & Partial<InstaSticker>;
export declare type StickerConfig = any & {
    story_sticker_ids: string;
};
export declare class StickerBuilder {
    private stickers;
    add(sticker: InstaSticker): this;
    build(): StickerConfig;
    static hashtag(options: StickerOptions<HashtagSticker>): HashtagSticker;
    static mention(options: StickerOptions<MentionSticker>): MentionSticker;
    static mentionReel(mediaInfo: {
        pk: string;
        user: {
            pk: string | number;
        };
    }, additional?: Partial<StickerOptions<MentionSticker>>): MentionSticker;
    static location(options: StickerOptions<LocationSticker>): LocationSticker;
    static countdown(options: StickerOptions<CountdownSticker>): CountdownSticker;
    static chat(options: StickerOptions<ChatSticker>): ChatSticker;
    static poll(options: StickerOptions<PollSticker>): PollSticker;
    static question(options: StickerOptions<QuestionSticker>): QuestionSticker;
    static quiz(options: StickerOptions<QuizSticker>): QuizSticker;
    static slider(options: StickerOptions<SliderSticker>): SliderSticker;
    static attachment(options: StickerOptions<AttachmentSticker>): AttachmentSticker;
    static attachmentFromMedia(mediaInfo: {
        pk: string;
        user: {
            pk: string | number;
        };
    }, additional?: Partial<StickerOptions<AttachmentSticker>>): AttachmentSticker;
}
