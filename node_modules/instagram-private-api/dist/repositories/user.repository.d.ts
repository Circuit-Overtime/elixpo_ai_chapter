import { Repository } from '../core/repository';
import { UserRepositoryInfoResponseUser, UserRepositorySearchResponseRootObject, UserRepositorySearchResponseUsersItem } from '../responses';
import { UserLookupOptions } from '../types/user.lookup.options';
export declare class UserRepository extends Repository {
    info(id: string | number): Promise<UserRepositoryInfoResponseUser>;
    usernameinfo(username: string): Promise<UserRepositoryInfoResponseUser>;
    arlinkDownloadInfo(): Promise<any>;
    search(username: string): Promise<UserRepositorySearchResponseRootObject>;
    searchExact(username: string): Promise<UserRepositorySearchResponseUsersItem>;
    accountDetails(id?: string | number): Promise<any>;
    formerUsernames(id?: string | number): Promise<any>;
    sharedFollowerAccounts(id: string | number): Promise<any>;
    flagUser(id: string | number): Promise<any>;
    getIdByUsername(username: string): Promise<number>;
    lookup(options: UserLookupOptions): Promise<any>;
}
