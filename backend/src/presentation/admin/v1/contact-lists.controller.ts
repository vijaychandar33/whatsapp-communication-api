import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { ContactListsService } from '../../../application/commands/contact-lists.service';

@ApiTags('Admin Contact Lists')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantScopeGuard)
@Controller('admin/v1/contact-lists')
export class ContactListsController {
  constructor(private readonly lists: ContactListsService) {}

  @Get()
  async list(@Query('organizationId') organizationId: string) {
    return {
      data: await this.lists.list(organizationId),
      message: 'OK',
    };
  }

  @Post()
  async create(
    @Query('organizationId') organizationId: string,
    @Body() body: { name: string; description?: string },
  ) {
    return {
      data: await this.lists.create(
        organizationId,
        body.name,
        body.description,
      ),
      message: 'Contact list created',
    };
  }

  @Get(':id')
  async get(
    @Param('id') id: string,
    @Query('organizationId') organizationId: string,
  ) {
    return {
      data: await this.lists.get(organizationId, id),
      message: 'OK',
    };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Query('organizationId') organizationId: string,
    @Body() body: { name?: string; description?: string | null },
  ) {
    return {
      data: await this.lists.update(organizationId, id, body),
      message: 'Contact list updated',
    };
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Query('organizationId') organizationId: string,
  ) {
    return {
      data: await this.lists.remove(organizationId, id),
      message: 'Contact list deleted',
    };
  }

  @Post(':id/members')
  async addMember(
    @Param('id') listId: string,
    @Query('organizationId') organizationId: string,
    @Body() body: { contactId: string },
  ) {
    return {
      data: await this.lists.addMember(
        organizationId,
        listId,
        body.contactId,
      ),
      message: 'Contact added to list',
    };
  }

  @Delete(':id/members/:contactId')
  async removeMember(
    @Param('id') listId: string,
    @Param('contactId') contactId: string,
    @Query('organizationId') organizationId: string,
  ) {
    return {
      data: await this.lists.removeMember(
        organizationId,
        listId,
        contactId,
      ),
      message: 'Contact removed from list',
    };
  }

  @Post(':id/import')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async importFile(
    @Param('id') listId: string,
    @Query('organizationId') organizationId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return {
      data: await this.lists.importFile(organizationId, listId, file),
      message: 'Import completed',
    };
  }
}
