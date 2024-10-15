/// <reference types="chance" />
import { Observable } from 'rxjs';
import { AttemptOptions } from '@lifeomic/attempt';
import { Repository } from './repository';
export declare abstract class Feed<Response = any, Item = any> extends Repository {
    attemptOptions: Partial<AttemptOptions<any>>;
    get items$(): Observable<Item[]>;
    observable(semaphore?: () => Promise<any>, attemptOptions?: Partial<AttemptOptions<any>>): Observable<Item[]>;
    protected moreAvailable: boolean;
    protected chance: Chance.Chance;
    protected rankToken: string;
    protected abstract set state(response: Response);
    abstract request(...args: any[]): Promise<Response>;
    abstract items(): Promise<Item[]>;
    serialize(): string;
    deserialize(data: string): void;
    toPlain(): Record<string, any>;
    isMoreAvailable(): boolean;
}
