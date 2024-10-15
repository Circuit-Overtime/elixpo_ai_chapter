export declare abstract class InstaSticker {
    width: number;
    height: number;
    rotation: number;
    x: number;
    y: number;
    z: number;
    isSticker: boolean;
    abstract get id(): string;
    abstract get key(): string;
    get additionalConfigureProperties(): any;
    center(): this;
    rotateDeg(deg: number): this;
    scale(factor: number): this;
    moveForward(layers?: number): this;
    moveBackwards(layers?: number): this;
    right(): this;
    left(): this;
    top(): this;
    bottom(): this;
    toJSON(): {
        [key: string]: any;
    };
}
