import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../guards/api-key.guard';
import { CurrentTenant, TenantContext } from '../../decorators';
import { PaginationDto } from '../../dto/pagination.dto';
import { ListContactsHandler } from '../../../application/queries/resource-handlers';

@ApiTags('Developer Contacts')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('api/v1/contacts')
export class ApiContactsController {
  constructor(private readonly listContacts: ListContactsHandler) {}

  @Get()
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query() pagination: PaginationDto,
  ) {
    return this.listContacts.execute(tenant.organizationId, pagination);
  }
}
