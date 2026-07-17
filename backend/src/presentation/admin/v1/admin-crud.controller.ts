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
import * as bcrypt from 'bcrypt';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { PaginationDto } from '../../dto/pagination.dto';
import {
  CreateOrganizationHandler,
  CreateUserHandler,
  CreateRoleHandler,
} from '../../../application/commands/create-handlers';
import {
  GetOrganizationHandler,
  GetUserHandler,
  ListOrganizationsHandler,
  ListRolesHandler,
  ListUsersHandler,
} from '../../../application/queries/list-handlers';
import {
  CreateOrganizationDto,
  CreateRoleDto,
  CreateUserDto,
} from './dto/admin.dto';
import { AuthService } from '../../../modules/auth/auth.service';
import { CreateApiKeyDto } from './dto/admin.dto';
import { ListApiKeysHandler } from '../../../application/queries/list-handlers';

@ApiTags('Admin Organizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/v1/organizations')
export class OrganizationsController {
  constructor(
    private readonly createOrg: CreateOrganizationHandler,
    private readonly listOrgs: ListOrganizationsHandler,
    private readonly getOrg: GetOrganizationHandler,
  ) {}

  @Get()
  async list(@Query() pagination: PaginationDto) {
    return this.listOrgs.execute(pagination);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.getOrg.execute(id), message: 'OK' };
  }

  @Post()
  async create(@Body() dto: CreateOrganizationDto) {
    return {
      data: await this.createOrg.execute(dto),
      message: 'Organization created',
    };
  }
}

@ApiTags('Admin Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/v1/users')
export class UsersController {
  constructor(
    private readonly createUser: CreateUserHandler,
    private readonly listUsers: ListUsersHandler,
    private readonly getUser: GetUserHandler,
  ) {}

  @Get()
  async list(
    @Query() pagination: PaginationDto,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.listUsers.execute(organizationId, pagination);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.getUser.execute(id), message: 'OK' };
  }

  @Post()
  async create(@Body() dto: CreateUserDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.createUser.execute({
      organizationId: dto.organizationId,
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      roleIds: dto.roleIds,
    });
    return {
      data: {
        id: user.id,
        organizationId: user.organizationId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status,
        createdAt: user.createdAt,
        roles: user.roles,
      },
      message: 'User created',
    };
  }
}

@ApiTags('Admin Roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/v1/roles')
export class RolesController {
  constructor(
    private readonly createRole: CreateRoleHandler,
    private readonly listRoles: ListRolesHandler,
  ) {}

  @Get()
  async list(@Query('organizationId') organizationId?: string) {
    return {
      data: await this.listRoles.execute(organizationId),
      message: 'OK',
    };
  }

  @Post()
  async create(@Body() dto: CreateRoleDto) {
    return {
      data: await this.createRole.execute(dto),
      message: 'Role created',
    };
  }
}

@ApiTags('Admin API Keys')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/v1/api-keys')
export class ApiKeysController {
  constructor(
    private readonly auth: AuthService,
    private readonly listKeys: ListApiKeysHandler,
  ) {}

  @Get()
  async list(
    @Query() pagination: PaginationDto,
    @Query('organizationId') organizationId: string,
  ) {
    return this.listKeys.execute(organizationId, pagination);
  }

  @Post()
  async create(@Body() dto: CreateApiKeyDto) {
    const result = await this.auth.createApiKeyPlain(
      dto.organizationId,
      dto.name,
      dto.scopes ?? [],
    );
    return {
      data: {
        ...result.apiKey,
        key: result.plainKey,
      },
      message: 'API key created — store the key securely; it will not be shown again',
    };
  }
}
