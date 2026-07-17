import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../guards/api-key.guard';
import { CurrentTenant, TenantContext } from '../../decorators';
import { UploadMediaHandler } from '../../../application/commands/media-handlers';
import { GetMediaHandler } from '../../../application/queries/resource-handlers';
import { UploadMediaUrlDto } from '../../admin/v1/dto/resources.dto';

@ApiTags('Developer Media')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('api/v1/media')
export class ApiMediaController {
  constructor(
    private readonly uploadMedia: UploadMediaHandler,
    private readonly getMedia: GetMediaHandler,
  ) {}

  @Post('upload')
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      oneOf: [
        {
          type: 'object',
          properties: {
            file: { type: 'string', format: 'binary' },
            communicationAccountId: { type: 'string' },
            uploadToProvider: { type: 'boolean' },
          },
        },
        {
          type: 'object',
          properties: {
            url: { type: 'string' },
            mimeType: { type: 'string' },
            fileName: { type: 'string' },
            communicationAccountId: { type: 'string' },
            uploadToProvider: { type: 'boolean' },
          },
        },
      ],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentTenant() tenant: TenantContext,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: UploadMediaUrlDto,
  ) {
    const media = await this.uploadMedia.execute({
      organizationId: tenant.organizationId,
      data: file?.buffer,
      url: body.url,
      mimeType: file?.mimetype ?? body.mimeType,
      fileName: file?.originalname ?? body.fileName,
      communicationAccountId: body.communicationAccountId,
      uploadToProvider: body.uploadToProvider,
    });

    return { data: media, message: 'Media uploaded' };
  }

  @Get(':id')
  async get(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
  ) {
    return {
      data: await this.getMedia.execute(tenant.organizationId, id),
      message: 'OK',
    };
  }
}
