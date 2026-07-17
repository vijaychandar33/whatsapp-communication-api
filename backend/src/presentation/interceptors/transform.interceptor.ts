import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { Request } from 'express';

export interface ApiSuccessBody<T = unknown> {
  success: true;
  message: string;
  data: T;
  meta: Record<string, unknown>;
  errors: null;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiSuccessBody<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccessBody<T>> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { requestId?: string; correlationId?: string }>();

    return next.handle().pipe(
      map((data) => {
        if (
          data &&
          typeof data === 'object' &&
          'success' in (data as object)
        ) {
          return data as unknown as ApiSuccessBody<T>;
        }

        const wrapped = data as
          | { data?: T; message?: string; meta?: Record<string, unknown> }
          | T;

        if (
          wrapped &&
          typeof wrapped === 'object' &&
          'data' in (wrapped as object) &&
          !Array.isArray(wrapped)
        ) {
          const obj = wrapped as {
            data: T;
            message?: string;
            meta?: Record<string, unknown>;
          };
          return {
            success: true,
            message: obj.message ?? 'OK',
            data: obj.data,
            meta: {
              requestId: request.requestId,
              correlationId: request.correlationId,
              timestamp: new Date().toISOString(),
              ...(obj.meta ?? {}),
            },
            errors: null,
          };
        }

        return {
          success: true,
          message: 'OK',
          data: data,
          meta: {
            requestId: request.requestId,
            correlationId: request.correlationId,
            timestamp: new Date().toISOString(),
          },
          errors: null,
        };
      }),
    );
  }
}
