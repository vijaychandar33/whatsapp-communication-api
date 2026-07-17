import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { DomainError } from '../../domain/errors';

export interface ApiErrorBody {
  success: false;
  message: string;
  data: null;
  meta: {
    requestId?: string;
    correlationId?: string;
    timestamp: string;
  };
  errors: Array<{ code: string; message: string; details?: unknown }>;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string; correlationId?: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';
    let details: unknown;

    if (exception instanceof DomainError) {
      status = exception.statusCode;
      message = exception.message;
      code = exception.code;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, unknown>;
        message = (obj.message as string) ?? exception.message;
        details = obj;
        if (Array.isArray(obj.message)) {
          message = 'Validation failed';
          details = { validation: obj.message };
          code = 'VALIDATION_ERROR';
        }
      }
      code =
        status === HttpStatus.UNAUTHORIZED
          ? 'UNAUTHORIZED'
          : status === HttpStatus.FORBIDDEN
            ? 'FORBIDDEN'
            : status === HttpStatus.NOT_FOUND
              ? 'NOT_FOUND'
              : code;
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(exception.message, exception.stack);
    }

    const body: ApiErrorBody = {
      success: false,
      message,
      data: null,
      meta: {
        requestId: request.requestId,
        correlationId: request.correlationId,
        timestamp: new Date().toISOString(),
      },
      errors: [{ code, message, details }],
    };

    response.status(status).json(body);
  }
}
