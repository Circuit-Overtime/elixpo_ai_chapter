import { Entity } from '../core/entity';
export declare class ProfileEntity extends Entity {
    pk: string | number;
    checkFollow(): Promise<import("..").FriendshipRepositoryChangeResponseFriendship_status>;
    checkUnfollow(): Promise<import("..").FriendshipRepositoryChangeResponseFriendship_status>;
}
