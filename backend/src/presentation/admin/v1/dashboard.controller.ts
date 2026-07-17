import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ChannelCode } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { PaginationDto } from '../../dto/pagination.dto';
import {
  GetAnalyticsHandler,
  GetDashboardHandler,
  GetSettingsHandler,
  ListAuditLogsHandler,
} from '../../../application/queries/resource-handlers';
import { UpdateSettingsHandler } from '../../../application/commands/settings-handlers';
import { UpdateSettingsDto } from './dto/resources.dto';

class AnalyticsQueryDto {
  @ApiProperty()
  @IsUUID()
  organizationId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @ApiPropertyOptional({ enum: ChannelCode })
  @IsOptional()
  @IsEnum(ChannelCode)
  channelCode?: ChannelCode;
}

@ApiTags('Admin Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/v1/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: GetDashboardHandler) {}

  @Get()
  async get(@Query('organizationId') organizationId: string) {
    return {
      data: await this.dashboard.execute(organizationId),
      message: 'OK',
    };
  }
}

@ApiTags('Admin Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/v1/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: GetAnalyticsHandler) {}

  @Get()
  async get(@Query() query: AnalyticsQueryDto) {
    return {
      ...(await this.analytics.execute(query)),
      message: 'OK',
    };
  }
}

@ApiTags('Admin Audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/v1/audit')
export class AuditController {
  constructor(private readonly listAudit: ListAuditLogsHandler) {}

  @Get()
  async list(
    @Query() pagination: PaginationDto,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.listAudit.execute(organizationId, pagination);
  }
}

@ApiTags('Admin Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/v1/settings')
export class SettingsController {
  constructor(
    private readonly getSettings: GetSettingsHandler,
    private readonly updateSettings: UpdateSettingsHandler,
  ) {}

  @Get()
  async get(@Query('organizationId') organizationId: string) {
    return {
      data: await this.getSettings.execute(organizationId),
      message: 'OK',
    };
  }

  @Put()
  async update(@Body() dto: UpdateSettingsDto) {
    return {
      data: await this.updateSettings.execute(dto),
      message: 'Settings updated',
    };
  }
}
