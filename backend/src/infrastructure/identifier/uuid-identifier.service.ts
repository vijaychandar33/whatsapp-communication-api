import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { IdentifierService } from '../../domain/interfaces/identifier.interface';

@Injectable()
export class UuidIdentifierService implements IdentifierService {
  generate(): string {
    return uuidv4();
  }
}
