import { HttpContextToken } from '@angular/common/http';

export const SKIP_GLOBAL_LOADER = new HttpContextToken<boolean>(() => false);
export const SILENT_HTTP_ERROR = new HttpContextToken<boolean>(() => false);
export const HTTP_RETRY_COUNT = new HttpContextToken<number>(() => 0);
