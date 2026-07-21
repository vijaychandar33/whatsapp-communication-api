import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { TenantScopeGuard } from '../../guards/tenant-scope.guard';
import { ListTemplatesQueryDto } from '../../dto/pagination.dto';
import {
  RefreshTemplateStatusHandler,
  SyncTemplatesHandler,
  DeleteTemplateHandler,
} from '../../../application/commands/template-handlers';
import { ListTemplatesHandler } from '../../../application/queries/resource-handlers';
import {
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
    private readonly syncTemplates: SyncTemplatesHandler,
    private readonly refreshTemplate: RefreshTemplateStatusHandler,
    private readonly deleteTemplate: DeleteTemplateHandler,
  ) {}

  @Get()
  async list(@Query() query: ListTemplatesQueryDto) {
    return this.listTemplates.execute(
      query.organizationId || '',
      query,
      query.channelCode,
      query.communicationAccountId,
    );
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

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Query('organizationId') organizationId: string,
  ) {
    return {
      data: await this.deleteTemplate.execute(organizationId, id),
      message: 'Template removed from system',
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
