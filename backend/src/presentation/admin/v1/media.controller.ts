import {
  Controller,
  Delete,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { PaginationDto } from '../../dto/pagination.dto';
import { DeleteMediaHandler } from '../../../application/commands/media-handlers';
import { ListMediaHandler } from '../../../application/queries/resource-handlers';

@ApiTags('Admin Media')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/v1/media')
export class AdminMediaController {
  constructor(
    private readonly listMedia: ListMediaHandler,
    private readonly deleteMedia: DeleteMediaHandler,
  ) {}

  @Get()
  async list(
    @Query() pagination: PaginationDto,
    @Query('organizationId') organizationId: string,
  ) {
    return this.listMedia.execute(organizationId, pagination);
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
