import { LoginRequiredResponse } from '../responses';
import { IgResponseError } from './ig-response.error';
export declare class IgUserHasLoggedOutError extends IgResponseError<LoginRequiredResponse> {
}
