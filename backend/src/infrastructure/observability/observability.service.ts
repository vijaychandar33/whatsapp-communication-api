import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ObservabilityService {
  private readonly logger = new Logger(ObservabilityService.name);

  info(message: string, meta?: Record<string, unknown>): void {
    this.logger.log(this.format(message, meta));
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.logger.warn(this.format(message, meta));
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.logger.error(this.format(message, meta));
  }

  private format(message: string, meta?: Record<string, unknown>): string {
    if (!meta || Object.keys(meta).length === 0) return message;
    return `${message} ${JSON.stringify(meta)}`;
  }
}
