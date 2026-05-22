export type LoadState = 'idle' | 'loading' | 'success' | 'error';

export interface AsyncState<T> {
  status: LoadState;
  data: T;
  error: string | null;
}

export interface PageRequest {
  page: number;
  limit: number;
  search?: string;
  sort?: string;
  direction?: 'asc' | 'desc';
}

export interface PageResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export const createAsyncState = <T>(data: T, status: LoadState = 'idle', error: string | null = null): AsyncState<T> => ({
  status,
  data,
  error,
});
