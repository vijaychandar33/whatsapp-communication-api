import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { TenantScopeGuard } from '../../guards/tenant-scope.guard';
import { PaginationDto } from '../../dto/pagination.dto';
import { DeleteMediaHandler, UploadMediaHandler } from '../../../application/commands/media-handlers';
import { ListMediaHandler } from '../../../application/queries/resource-handlers';
import { UploadMediaUrlDto } from './dto/resources.dto';

@ApiTags('Admin Media')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantScopeGuard)
@Controller('admin/v1/media')
export class AdminMediaController {
  constructor(
    private readonly listMedia: ListMediaHandler,
    private readonly deleteMedia: DeleteMediaHandler,
    private readonly uploadMedia: UploadMediaHandler,
  ) {}

  @Get()
  async list(
    @Query() pagination: PaginationDto,
    @Query('organizationId') organizationId: string,
  ) {
    return this.listMedia.execute(organizationId, pagination);
  }

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
    @Query('organizationId') organizationId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: UploadMediaUrlDto & { organizationId?: string },
  ) {
    const orgId = body.organizationId || organizationId;
    const media = await this.uploadMedia.execute({
      organizationId: orgId,
      data: file?.buffer,
      url: body.url,
      mimeType: file?.mimetype ?? body.mimeType,
      fileName: file?.originalname ?? body.fileName,
      communicationAccountId: body.communicationAccountId,
      uploadToProvider: body.uploadToProvider,
    });

    return { data: media, message: 'Media uploaded' };
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Query('organizationId') organizationId: string,
  ) {
    await this.deleteMedia.execute(organizationId, id);
    return { data: { id }, message: 'Media deleted' };
  }
}
