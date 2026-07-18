import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { TenantScopeGuard } from '../../guards/tenant-scope.guard';
import { ListContactsQueryDto } from '../../dto/pagination.dto';
import {
  CreateContactHandler,
  DeleteContactHandler,
  UpdateContactHandler,
} from '../../../application/commands/contact-handlers';
import {
  GetContactHandler,
  ListContactsHandler,
} from '../../../application/queries/resource-handlers';
import { CreateContactDto, UpdateContactDto } from './dto/resources.dto';

@ApiTags('Admin Contacts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantScopeGuard)
@Controller('admin/v1/contacts')
export class AdminContactsController {
  constructor(
    private readonly createContact: CreateContactHandler,
    private readonly updateContact: UpdateContactHandler,
    private readonly deleteContact: DeleteContactHandler,
    private readonly listContacts: ListContactsHandler,
    private readonly getContact: GetContactHandler,
  ) {}

  @Get()
  async list(@Query() query: ListContactsQueryDto) {
    return this.listContacts.execute(query.organizationId || '', query, {
      q: query.q,
      tagId: query.tagId,
    });
  }

  @Post()
  async create(@Body() dto: CreateContactDto) {
    return {
      data: await this.createContact.execute(dto),
      message: 'Contact created',
    };
  }

  @Get(':id')
  async get(
    @Param('id') id: string,
    @Query('organizationId') organizationId: string,
  ) {
    return {
      data: await this.getContact.execute(organizationId, id),
      message: 'OK',
    };
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Query('organizationId') organizationId: string,
    @Body() dto: UpdateContactDto,
  ) {
    return {
      data: await this.updateContact.execute({
        id,
        organizationId,
        ...dto,
      }),
      message: 'Contact updated',
    };
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Query('organizationId') organizationId: string,
  ) {
    await this.deleteContact.execute(organizationId, id);
    return { data: { id }, message: 'Contact deleted' };
  }
}
