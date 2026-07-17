import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { BroadcastAudienceType } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { TenantScopeGuard } from '../../guards/tenant-scope.guard';
import { RolesGuard, RequireCapability } from '../../guards/roles.guard';
import { CurrentUser } from '../../decorators';
import { PaginationDto } from '../../dto/pagination.dto';
import { BroadcastsService } from '../../../application/commands/broadcasts.service';

class AudienceFilterDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  tagIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  contactIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  phones?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  paramsByContactId?: Record<string, string[]>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  paramsByPhone?: Record<string, string[]>;
}

class CreateBroadcastDto {
  @ApiProperty()
  @IsUUID()
  organizationId!: string;

  @ApiProperty()
  @IsUUID()
  communicationAccountId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  templateName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  templateLanguage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  templateComponents?: unknown;

  @ApiProperty({ enum: BroadcastAudienceType })
  @IsEnum(BroadcastAudienceType)
  audienceType!: BroadcastAudienceType;

  @ApiPropertyOptional({ type: AudienceFilterDto })
  @IsOptional()
  @IsObject()
  audienceFilter?: AudienceFilterDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scheduledAt?: string;
}

@ApiTags('Admin Broadcasts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantScopeGuard, RolesGuard)
@Controller('admin/v1/broadcasts')
export class BroadcastsController {
  constructor(private readonly broadcasts: BroadcastsService) {}

  @Get()
  @RequireCapability('messaging_read')
  async list(
    @Query() pagination: PaginationDto,
    @Query('organizationId') organizationId: string,
  ) {
    return this.broadcasts.list(organizationId, pagination);
  }

  @Get(':id')
  @RequireCapability('messaging_read')
  async get(
    @Param('id') id: string,
    @Query('organizationId') organizationId: string,
  ) {
    return {
      data: await this.broadcasts.get(organizationId, id),
      message: 'OK',
    };
  }

  @Post('preview')
  @RequireCapability('messaging_write')
  async preview(@Body() dto: CreateBroadcastDto) {
    return {
      data: await this.broadcasts.previewAudience(dto.organizationId, dto),
      message: 'OK',
    };
  }

  @Post()
  @RequireCapability('messaging_write')
  async create(
    @Body() dto: CreateBroadcastDto,
    @CurrentUser() user: { userId?: string; sub?: string },
  ) {
    return {
      data: await this.broadcasts.create({
        ...dto,
        createdByUserId: user.userId ?? user.sub,
      }),
      message: 'Broadcast created',
    };
  }

  @Post(':id/start')
  @RequireCapability('messaging_write')
  async start(
    @Param('id') id: string,
    @Query('organizationId') organizationId: string,
  ) {
    return {
      data: await this.broadcasts.start(organizationId, id),
      message: 'Broadcast started',
    };
  }

  @Post(':id/cancel')
  @RequireCapability('messaging_write')
  async cancel(
    @Param('id') id: string,
    @Query('organizationId') organizationId: string,
  ) {
    return {
      data: await this.broadcasts.cancel(organizationId, id),
      message: 'Broadcast cancelled',
    };
  }
}
