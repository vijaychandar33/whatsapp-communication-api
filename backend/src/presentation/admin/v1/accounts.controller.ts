import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { TenantScopeGuard } from '../../guards/tenant-scope.guard';
import { PaginationDto } from '../../dto/pagination.dto';
import {
  ConnectAccountHandler,
  CreateAccountHandler,
  DisconnectAccountHandler,
  GetAccountStatusHandler,
  UpdateAccountHandler,
} from '../../../application/commands/account-handlers';
import {
  GetAccountHandler,
  ListAccountsHandler,
} from '../../../application/queries/resource-handlers';
import {
  ConnectAccountDto,
  CreateAccountDto,
  UpdateAccountDto,
} from './dto/resources.dto';

@ApiTags('Admin Accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantScopeGuard)
@Controller('admin/v1/accounts')
export class AccountsController {
  constructor(
    private readonly createAccount: CreateAccountHandler,
    private readonly updateAccount: UpdateAccountHandler,
    private readonly connectAccount: ConnectAccountHandler,
    private readonly disconnectAccount: DisconnectAccountHandler,
    private readonly getStatus: GetAccountStatusHandler,
    private readonly listAccounts: ListAccountsHandler,
    private readonly getAccount: GetAccountHandler,
  ) {}

  @Get()
  async list(
    @Query() pagination: PaginationDto,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.listAccounts.execute(organizationId, pagination);
  }

  @Post()
  async create(@Body() dto: CreateAccountDto) {
    return {
      data: await this.createAccount.execute(dto),
      message: 'Account created',
    };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.getAccount.execute(id), message: 'OK' };
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return {
      data: await this.updateAccount.execute({ id, ...dto }),
      message: 'Account updated',
    };
  }

  @Post(':id/connect')
  async connect(@Param('id') id: string, @Body() dto: ConnectAccountDto) {
    const account = await this.connectAccount.execute({ id, ...dto });
    return {
      data: {
        id: account.id,
        connectionStatus: account.connectionStatus,
        externalAccountId: account.externalAccountId,
      },
      message: 'Account connected',
    };
  }

  @Post(':id/disconnect')
  async disconnect(@Param('id') id: string) {
    const account = await this.disconnectAccount.execute(id);
    return {
      data: {
        id: account.id,
        connectionStatus: account.connectionStatus,
      },
      message: 'Account disconnected',
    };
  }

  @Get(':id/status')
  async status(@Param('id') id: string) {
    return { data: await this.getStatus.execute(id), message: 'OK' };
  }
}
