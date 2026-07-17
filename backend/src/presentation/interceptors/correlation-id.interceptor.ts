import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<
      Request & { requestId?: string; correlationId?: string }
    >();
    const response = http.getResponse<Response>();

    const requestId = uuidv4();
    const correlationId =
      (request.headers['x-correlation-id'] as string | undefined) ??
      (request.headers['x-request-id'] as string | undefined) ??
      requestId;

    request.requestId = requestId;
    request.correlationId = correlationId;
    response.setHeader('x-request-id', requestId);
    response.setHeader('x-correlation-id', correlationId);

    return next.handle();
  }
}
