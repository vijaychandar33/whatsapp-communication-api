import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { AiProviderCode } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { TenantScopeGuard } from '../../guards/tenant-scope.guard';
import { RolesGuard, RequireCapability } from '../../guards/roles.guard';
import { CurrentUser } from '../../decorators';
import { AiService } from '../../../application/ai/ai.service';

class UpsertAiConfigDto {
  @ApiProperty()
  @IsUUID()
  organizationId!: string;

  @ApiPropertyOptional({ enum: AiProviderCode })
  @IsOptional()
  @IsEnum(AiProviderCode)
  provider?: AiProviderCode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  systemPrompt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoReplyEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  autoReplyMaxPerConversation?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  handoffUserId?: string | null;
}

class TestAiDto {
  @ApiProperty()
  @IsUUID()
  organizationId!: string;

  @ApiPropertyOptional({ enum: AiProviderCode })
  @IsOptional()
  @IsEnum(AiProviderCode)
  provider?: AiProviderCode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  apiKey?: string;
}

class CreateKnowledgeDto {
  @ApiProperty()
  @IsUUID()
  organizationId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  content!: string;
}

class UpdateKnowledgeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string;
}

class DraftDto {
  @ApiProperty()
  @IsUUID()
  organizationId!: string;

  @ApiProperty()
  @IsUUID()
  conversationId!: string;
}

class AutoreplyDto {
  @ApiProperty()
  @IsBoolean()
  paused!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  assignToMe?: boolean;
}

@ApiTags('Admin AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantScopeGuard, RolesGuard)
@Controller('admin/v1/ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('config')
  @RequireCapability('messaging_read')
  async getConfig(@Query('organizationId') organizationId: string) {
    return {
      data: await this.ai.getConfig(organizationId),
      message: 'OK',
    };
  }

  @Put('config')
  @RequireCapability('workspace')
  async upsertConfig(@Body() dto: UpsertAiConfigDto) {
    return {
      data: await this.ai.upsertConfig(dto),
      message: 'AI config saved',
    };
  }

  @Delete('config')
  @RequireCapability('workspace')
  async deleteConfig(@Query('organizationId') organizationId: string) {
    return {
      data: await this.ai.deleteConfig(organizationId),
      message: 'AI config deleted',
    };
  }

  @Post('test')
  @RequireCapability('workspace')
  async test(@Body() dto: TestAiDto) {
    return {
      data: await this.ai.testConfig(dto.organizationId, dto),
      message: 'OK',
    };
  }

  @Get('knowledge')
  @RequireCapability('messaging_read')
  async listKnowledge(@Query('organizationId') organizationId: string) {
    return {
      data: await this.ai.listDocuments(organizationId),
      message: 'OK',
    };
  }

  @Post('knowledge')
  @RequireCapability('workspace')
  async createKnowledge(@Body() dto: CreateKnowledgeDto) {
    return {
      data: await this.ai.createDocument(
        dto.organizationId,
        dto.title,
        dto.content,
      ),
      message: 'Document created',
    };
  }

  @Post('knowledge/reindex')
  @RequireCapability('workspace')
  async reindex(@Body() body: { organizationId: string }) {
    return {
      data: await this.ai.reindex(body.organizationId),
      message: 'Reindexed',
    };
  }

  @Get('knowledge/:id')
  @RequireCapability('messaging_read')
  async getKnowledge(
    @Param('id') id: string,
    @Query('organizationId') organizationId: string,
  ) {
    return {
      data: await this.ai.getDocument(organizationId, id),
      message: 'OK',
    };
  }

  @Patch('knowledge/:id')
  @RequireCapability('workspace')
  async updateKnowledge(
    @Param('id') id: string,
    @Query('organizationId') organizationId: string,
    @Body() dto: UpdateKnowledgeDto,
  ) {
    return {
      data: await this.ai.updateDocument(organizationId, id, dto),
      message: 'Document updated',
    };
  }

  @Delete('knowledge/:id')
  @RequireCapability('workspace')
  async deleteKnowledge(
    @Param('id') id: string,
    @Query('organizationId') organizationId: string,
  ) {
    return {
      data: await this.ai.deleteDocument(organizationId, id),
      message: 'Document deleted',
    };
  }

  @Post('draft')
  @RequireCapability('messaging_write')
  async draft(@Body() dto: DraftDto) {
    return {
      data: await this.ai.draft(dto.organizationId, dto.conversationId),
      message: 'OK',
    };
  }

  @Post('conversations/:id/autoreply')
  @RequireCapability('messaging_write')
  async autoreply(
    @Param('id') id: string,
    @Query('organizationId') organizationId: string,
    @Body() dto: AutoreplyDto,
    @CurrentUser() user: { userId?: string; sub?: string },
  ) {
    return {
      data: await this.ai.setAutoreplyPaused(
        organizationId,
        id,
        dto.paused,
        dto.assignToMe ? (user.userId ?? user.sub) : undefined,
      ),
      message: 'OK',
    };
  }

  @Get('usage')
  @RequireCapability('workspace')
  async usage(
    @Query('organizationId') organizationId: string,
    @Query('days') days?: string,
  ) {
    return {
      data: await this.ai.usage(
        organizationId,
        days ? Number(days) : 30,
      ),
      message: 'OK',
    };
  }
}
