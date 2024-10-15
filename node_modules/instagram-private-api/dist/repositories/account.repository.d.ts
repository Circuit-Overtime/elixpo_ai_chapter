/// <reference types="node" />
import { Repository } from '../core/repository';
import { AccountRepositoryCurrentUserResponseRootObject, AccountRepositoryLoginResponseLogged_in_user, StatusResponse } from '../responses';
import { AccountEditProfileOptions, AccountTwoFactorLoginOptions } from '../types';
export declare class AccountRepository extends Repository {
    private static accountDebug;
    login(username: string, password: string): Promise<AccountRepositoryLoginResponseLogged_in_user>;
    static createJazoest(input: string): string;
    encryptPassword(password: string): {
        time: string;
        encrypted: string;
    };
    twoFactorLogin(options: AccountTwoFactorLoginOptions): Promise<AccountRepositoryLoginResponseLogged_in_user>;
    logout(): Promise<StatusResponse>;
    create({ username, password, email, first_name }: {
        username: any;
        password: any;
        email: any;
        first_name: any;
    }): Promise<any>;
    currentUser(): Promise<import("../responses").AccountRepositoryCurrentUserResponseUser>;
    setBiography(text: string): Promise<import("../responses").AccountRepositoryCurrentUserResponseUser>;
    changeProfilePicture(picture: Buffer): Promise<AccountRepositoryCurrentUserResponseRootObject>;
    editProfile(options: AccountEditProfileOptions): Promise<import("../responses").AccountRepositoryCurrentUserResponseUser>;
    changePassword(oldPassword: string, newPassword: string): Promise<any>;
    removeProfilePicture(): Promise<AccountRepositoryCurrentUserResponseRootObject>;
    setPrivate(): Promise<AccountRepositoryCurrentUserResponseRootObject>;
    setPublic(): Promise<AccountRepositoryCurrentUserResponseRootObject>;
    private command;
    readMsisdnHeader(usage?: string): Promise<any>;
    msisdnHeaderBootstrap(usage?: string): Promise<any>;
    contactPointPrefill(usage?: string): Promise<any>;
    getPrefillCandidates(): Promise<any>;
    processContactPointSignals(): Promise<any>;
    sendRecoveryFlowEmail(query: string): Promise<any>;
}
