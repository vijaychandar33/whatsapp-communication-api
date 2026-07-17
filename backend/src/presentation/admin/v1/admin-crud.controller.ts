import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as bcrypt from 'bcrypt';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../guards/optional-jwt-auth.guard';
import {
  RequestUser,
  TenantScopeGuard,
} from '../../guards/tenant-scope.guard';
import { RolesGuard, RequireCapability } from '../../guards/roles.guard';
import { CurrentUser, Public } from '../../decorators';
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
  ListApiKeysHandler,
} from '../../../application/queries/list-handlers';
import {
  CreateOrganizationDto,
  CreateRoleDto,
  CreateUserDto,
} from './dto/admin.dto';
import { AuthService, API_KEY_SCOPES } from '../../../modules/auth/auth.service';
import { MembersService } from '../../../application/commands/members.service';
import { Type } from 'class-transformer';
import { InvitationRole } from '@prisma/client';
import { IsArray } from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty()
  @IsUUID()
  organizationId!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional({ type: [String], enum: API_KEY_SCOPES })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @ApiPropertyOptional({ minimum: 1, maximum: 365 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  expiresInDays?: number;
}

export class PatchUserRoleDto {
  @ApiProperty({ enum: ['admin', 'developer', 'staff'] })
  @IsEnum(['admin', 'developer', 'staff'] as const)
  role!: 'admin' | 'developer' | 'staff';
}

export class RenameOrganizationDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  name!: string;
}

export class TransferOwnershipDto {
  @ApiProperty()
  @IsUUID()
  newOwnerUserId!: string;
}

export class CreateInvitationDto {
  @ApiProperty()
  @IsUUID()
  organizationId!: string;

  @ApiProperty()
  @IsEmail({ require_tld: false })
  email!: string;

  @ApiProperty({ enum: ['ADMIN', 'DEVELOPER', 'STAFF'] })
  @IsEnum(['ADMIN', 'DEVELOPER', 'STAFF'] as const)
  role!: 'ADMIN' | 'DEVELOPER' | 'STAFF';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  expiresInDays?: number;
}

export class RedeemInvitationDto {
  @ApiProperty()
  @IsString()
  token!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({ require_tld: false })
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;
}

@ApiTags('Admin Organizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantScopeGuard, RolesGuard)
@Controller('admin/v1/organizations')
export class OrganizationsController {
  constructor(
    private readonly createOrg: CreateOrganizationHandler,
    private readonly listOrgs: ListOrganizationsHandler,
    private readonly getOrg: GetOrganizationHandler,
    private readonly members: MembersService,
  ) {}

  @Get()
  async list(
    @Query() pagination: PaginationDto,
    @CurrentUser() user: RequestUser,
  ) {
    if (user.organizationType !== 'SYSTEM') {
      return {
        data: [await this.getOrg.execute(user.organizationId)],
        meta: { page: 1, limit: 1, total: 1, totalPages: 1 },
        message: 'OK',
      };
    }
    return this.listOrgs.execute(pagination);
  }

  @Get(':id')
  async get(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    if (user.organizationType !== 'SYSTEM' && id !== user.organizationId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
    return { data: await this.getOrg.execute(id), message: 'OK' };
  }

  @Patch(':id')
  @RequireCapability('settings')
  async rename(
    @Param('id') id: string,
    @Body() dto: RenameOrganizationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return {
      data: await this.members.renameOrganization(user.userId, id, dto.name),
      message: 'Organization updated',
    };
  }

  @Post(':id/transfer-ownership')
  async transferOwnership(
    @Param('id') id: string,
    @Body() dto: TransferOwnershipDto,
    @CurrentUser() user: RequestUser,
  ) {
    if (user.organizationType !== 'SYSTEM' && id !== user.organizationId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
    return {
      data: await this.members.transferOwnership(
        user.userId,
        dto.newOwnerUserId,
      ),
      message: 'Ownership transferred',
    };
  }

  @Post()
  async create(
    @Body() dto: CreateOrganizationDto,
    @CurrentUser() user: RequestUser,
  ) {
    if (user.organizationType !== 'SYSTEM') {
      throw new ForbiddenException(
        'Only platform admins can create organizations',
      );
    }
    return {
      data: await this.createOrg.execute(dto),
      message: 'Organization created',
    };
  }
}

@ApiTags('Admin Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantScopeGuard, RolesGuard)
@Controller('admin/v1/users')
export class UsersController {
  constructor(
    private readonly createUser: CreateUserHandler,
    private readonly listUsers: ListUsersHandler,
    private readonly getUser: GetUserHandler,
    private readonly members: MembersService,
  ) {}

  @Get()
  async list(
    @Query() pagination: PaginationDto,
    @Query('organizationId') organizationId?: string,
  ) {
    if (organizationId) {
      const data = await this.members.listMembers(organizationId);
      return {
        data,
        meta: {
          page: 1,
          limit: data.length || 20,
          total: data.length,
          totalPages: 1,
        },
        message: 'OK',
      };
    }
    return this.listUsers.execute(organizationId, pagination);
  }

  @Get(':id')
  async get(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    const found = await this.getUser.execute(id);
    if (
      user.organizationType !== 'SYSTEM' &&
      found.organizationId !== user.organizationId
    ) {
      throw new ForbiddenException('Cross-tenant access denied');
    }
    return { data: found, message: 'OK' };
  }

  @Patch(':id/role')
  @RequireCapability('members')
  async changeRole(
    @Param('id') id: string,
    @Body() dto: PatchUserRoleDto,
    @CurrentUser() user: RequestUser,
  ) {
    return {
      data: await this.members.changeRole(user.userId, id, dto.role),
      message: 'Role updated',
    };
  }

  @Delete(':id')
  @RequireCapability('members')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return {
      data: await this.members.removeMember(user.userId, id),
      message: 'Member removed',
    };
  }

  @Post()
  @RequireCapability('members')
  async create(@Body() dto: CreateUserDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const created = await this.createUser.execute({
      organizationId: dto.organizationId,
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      roleIds: dto.roleIds,
    });
    return {
      data: {
        id: created.id,
        organizationId: created.organizationId,
        email: created.email,
        firstName: created.firstName,
        lastName: created.lastName,
        status: created.status,
        createdAt: created.createdAt,
        roles: created.roles,
      },
      message: 'User created',
    };
  }
}

@ApiTags('Admin Roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantScopeGuard)
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
@UseGuards(JwtAuthGuard, TenantScopeGuard, RolesGuard)
@Controller('admin/v1/api-keys')
export class ApiKeysController {
  constructor(
    private readonly auth: AuthService,
    private readonly listKeys: ListApiKeysHandler,
  ) {}

  @Get()
  @RequireCapability('api_keys')
  async list(
    @Query() pagination: PaginationDto,
    @Query('organizationId') organizationId: string,
  ) {
    return this.listKeys.execute(organizationId, pagination);
  }

  @Post()
  @RequireCapability('api_keys')
  async create(@Body() dto: CreateApiKeyDto) {
    const result = await this.auth.createApiKeyPlain(
      dto.organizationId,
      dto.name,
      dto.scopes ?? [],
      dto.expiresInDays,
    );
    return {
      data: {
        ...result.apiKey,
        key: result.plainKey,
      },
      message:
        'API key created — store the key securely; it will not be shown again',
    };
  }

  @Delete(':id')
  @RequireCapability('api_keys')
  async revoke(
    @Param('id') id: string,
    @Query('organizationId') organizationId: string,
  ) {
    return {
      data: await this.auth.revokeApiKey(organizationId, id),
      message: 'API key revoked',
    };
  }
}

@ApiTags('Admin Invitations')
@Controller('admin/v1/invitations')
export class InvitationsController {
  constructor(private readonly members: MembersService) {}

  @Public()
  @Get('peek')
  async peek(@Query('token') token: string) {
    return {
      data: await this.members.peekInvitation(token),
      message: 'OK',
    };
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Post('redeem')
  async redeem(
    @Body() dto: RedeemInvitationDto,
    @CurrentUser() user?: RequestUser,
  ) {
    return {
      data: await this.members.redeemInvitation({
        token: dto.token,
        actorUserId: user?.userId,
        email: dto.email,
        password: dto.password,
        firstName: dto.firstName,
        lastName: dto.lastName,
      }),
      message: 'Invitation accepted',
    };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, TenantScopeGuard, RolesGuard)
  @RequireCapability('members')
  @Get()
  async list(@Query('organizationId') organizationId: string) {
    return {
      data: await this.members.listInvitations(organizationId),
      message: 'OK',
    };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, TenantScopeGuard, RolesGuard)
  @RequireCapability('members')
  @Post()
  async create(
    @Body() dto: CreateInvitationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return {
      data: await this.members.createInvitation(user.userId, {
        ...dto,
        role: dto.role as InvitationRole,
      }),
      message: 'Invitation created',
    };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, TenantScopeGuard, RolesGuard)
  @RequireCapability('members')
  @Delete(':id')
  async revoke(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return {
      data: await this.members.revokeInvitation(user.userId, id),
      message: 'Invitation revoked',
    };
  }
}
