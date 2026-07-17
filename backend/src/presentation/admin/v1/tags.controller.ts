import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { TenantScopeGuard } from '../../guards/tenant-scope.guard';
import { CurrentUser } from '../../decorators';
import { TagsService } from '../../../application/commands/tags.service';

@ApiTags('Admin Tags')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantScopeGuard)
@Controller('admin/v1/tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  async list(@Query('organizationId') organizationId: string) {
    return {
      data: await this.tags.list(organizationId),
      message: 'OK',
    };
  }

  @Post()
  async create(
    @Query('organizationId') organizationId: string,
    @Body() body: { name: string; color?: string },
  ) {
    return {
      data: await this.tags.create(organizationId, body.name, body.color),
      message: 'Tag created',
    };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Query('organizationId') organizationId: string,
    @Body() body: { name?: string; color?: string },
  ) {
    return {
      data: await this.tags.update(organizationId, id, body),
      message: 'Tag updated',
    };
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Query('organizationId') organizationId: string,
  ) {
    return {
      data: await this.tags.remove(organizationId, id),
      message: 'Tag deleted',
    };
  }
}

@ApiTags('Admin Contact Tags & Notes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantScopeGuard)
@Controller('admin/v1/contacts')
export class ContactTagsNotesController {
  constructor(private readonly tags: TagsService) {}

  @Post(':id/tags')
  async addTag(
    @Param('id') contactId: string,
    @Query('organizationId') organizationId: string,
    @Body() body: { tagId: string },
  ) {
    return {
      data: await this.tags.addToContact(
        organizationId,
        contactId,
        body.tagId,
      ),
      message: 'Tag assigned',
    };
  }

  @Delete(':id/tags/:tagId')
  async removeTag(
    @Param('id') contactId: string,
    @Param('tagId') tagId: string,
    @Query('organizationId') organizationId: string,
  ) {
    return {
      data: await this.tags.removeFromContact(
        organizationId,
        contactId,
        tagId,
      ),
      message: 'Tag removed',
    };
  }

  @Get(':id/notes')
  async listNotes(
    @Param('id') contactId: string,
    @Query('organizationId') organizationId: string,
  ) {
    return {
      data: await this.tags.listNotes(organizationId, contactId),
      message: 'OK',
    };
  }

  @Post(':id/notes')
  async addNote(
    @Param('id') contactId: string,
    @Query('organizationId') organizationId: string,
    @Body() body: { noteText: string },
    @CurrentUser() user: { userId?: string; sub?: string },
  ) {
    return {
      data: await this.tags.addNote(
        organizationId,
        contactId,
        body.noteText,
        user.userId ?? user.sub,
      ),
      message: 'Note added',
    };
  }

  @Delete(':contactId/notes/:noteId')
  async deleteNote(
    @Param('noteId') noteId: string,
    @Query('organizationId') organizationId: string,
  ) {
    return {
      data: await this.tags.deleteNote(organizationId, noteId),
      message: 'Note deleted',
    };
  }
}
