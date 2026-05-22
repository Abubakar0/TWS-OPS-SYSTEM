import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { SILENT_HTTP_ERROR } from '../http/http-context.tokens';
import { LoginResponse, User } from '../models/auth.models';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  constructor(private readonly http: HttpClient) {}

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${environment.apiUrl}/auth/login`, { email, password });
  }

  getCurrentUser(): Observable<User> {
    return this.http
      .get<{ user: User }>(`${environment.apiUrl}/auth/me`, {
        context: new HttpContext().set(SILENT_HTTP_ERROR, true),
      })
      .pipe(map((response) => response.user));
  }
}
