import { Repository } from '../core/repository';
export declare class SearchService extends Repository {
    blended(query: string): Promise<import("..").FbsearchRepositoryTopsearchFlatResponseListItem[]>;
    blendedItems(query: string): Promise<(import("..").FbsearchRepositoryTopsearchFlatResponsePlace | import("..").FbsearchRepositoryTopsearchFlatResponseHashtag | import("..").FbsearchRepositoryTopsearchFlatResponseUser)[]>;
    users(query: string): Promise<import("..").UserRepositorySearchResponseUsersItem[]>;
    tags(query: string): Promise<import("..").TagRepositorySearchResponseResultsItem[]>;
    places(query: string): Promise<import("..").FbsearchRepositoryPlacesResponseItemsItem[]>;
    location(latitude: number, longitude: number, query?: string): Promise<import("..").LocationRepositorySearchResponseVenuesItem[]>;
}
