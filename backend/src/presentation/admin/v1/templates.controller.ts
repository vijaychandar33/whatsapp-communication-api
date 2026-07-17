import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ChannelCode } from '@prisma/client';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { TenantScopeGuard } from '../../guards/tenant-scope.guard';
import { PaginationDto } from '../../dto/pagination.dto';
import {
  CreateTemplateHandler,
  RefreshTemplateStatusHandler,
  SyncTemplatesHandler,
} from '../../../application/commands/template-handlers';
import { ListTemplatesHandler } from '../../../application/queries/resource-handlers';
import {
  CreateTemplateDto,
  RefreshTemplateDto,
  SyncTemplatesDto,
} from './dto/resources.dto';

@ApiTags('Admin Templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantScopeGuard)
@Controller('admin/v1/templates')
export class TemplatesController {
  constructor(
    private readonly listTemplates: ListTemplatesHandler,
    private readonly createTemplate: CreateTemplateHandler,
    private readonly syncTemplates: SyncTemplatesHandler,
    private readonly refreshTemplate: RefreshTemplateStatusHandler,
  ) {}

  @Get()
  async list(
    @Query() pagination: PaginationDto,
    @Query('organizationId') organizationId: string,
    @Query('channelCode') channelCode?: ChannelCode,
    @Query('communicationAccountId') communicationAccountId?: string,
  ) {
    return this.listTemplates.execute(
      organizationId,
      pagination,
      channelCode,
      communicationAccountId,
    );
  }

  @Post()
  async create(@Body() dto: CreateTemplateDto) {
    return {
      data: await this.createTemplate.execute(dto),
      message: dto.draftOnly
        ? 'Template draft saved'
        : 'Template submitted to Meta',
    };
  }

  @Post('sync')
  async sync(@Body() dto: SyncTemplatesDto) {
    return {
      data: await this.syncTemplates.execute(
        dto.organizationId,
        dto.communicationAccountId,
      ),
      message: 'Templates synced',
    };
  }

  @Post(':id/refresh')
  async refresh(@Param('id') id: string, @Body() dto: RefreshTemplateDto) {
    return {
      data: await this.refreshTemplate.execute(
        dto.organizationId,
        id,
        dto.communicationAccountId,
      ),
      message: 'Template status refreshed',
    };
  }
}
