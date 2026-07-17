import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser, Public } from '../../decorators';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import {
  ChangePasswordDto,
  LoginDto,
  LogoutDto,
  RefreshTokenDto,
  RegisterDto,
  UpdateMeDto,
  UpdatePreferencesDto,
} from './dto/auth.dto';
import { AuthService } from '../../../modules/auth/auth.service';

@ApiTags('Admin Auth')
@Controller('admin/v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return {
      data: await this.auth.register({
        email: dto.email,
        password: dto.password,
        organizationName: dto.organizationName,
        organizationSlug: dto.organizationSlug,
        firstName: dto.firstName,
        lastName: dto.lastName,
      }),
      message: 'Registered',
    };
  }

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return {
      data: await this.auth.login(dto.email, dto.password, {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      }),
      message: 'Logged in',
    };
  }

  @Public()
  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    return {
      data: await this.auth.refresh(dto.refreshToken, {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      }),
      message: 'Token refreshed',
    };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: { userId: string }) {
    return { data: await this.auth.me(user.userId), message: 'OK' };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('me')
  async updateMe(
    @CurrentUser() user: { userId: string },
    @Body() dto: UpdateMeDto,
  ) {
    return {
      data: await this.auth.updateMe(user.userId, dto),
      message: 'Profile updated',
    };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async changePassword(
    @CurrentUser() user: { userId: string },
    @Body() dto: ChangePasswordDto,
  ) {
    return {
      data: await this.auth.changePassword(
        user.userId,
        dto.currentPassword,
        dto.newPassword,
      ),
      message: 'Password changed',
    };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  async sessions(@CurrentUser() user: { userId: string }) {
    return {
      data: await this.auth.listSessions(user.userId),
      message: 'OK',
    };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete('sessions/:id')
  async revokeSession(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return {
      data: await this.auth.revokeSession(user.userId, id),
      message: 'Session revoked',
    };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete('sessions')
  async revokeAllSessions(@CurrentUser() user: { userId: string }) {
    return {
      data: await this.auth.revokeAllSessions(user.userId),
      message: 'All sessions revoked',
    };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Body() dto: LogoutDto) {
    if (dto.refreshToken) {
      await this.auth.logout(dto.refreshToken);
    }
    return { data: { ok: true }, message: 'Logged out' };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('preferences')
  async getPreferences(@CurrentUser() user: { userId: string }) {
    return {
      data: await this.auth.getPreferences(user.userId),
      message: 'OK',
    };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('preferences')
  async updatePreferences(
    @CurrentUser() user: { userId: string },
    @Body() dto: UpdatePreferencesDto,
  ) {
    return {
      data: await this.auth.updatePreferences(user.userId, dto),
      message: 'Preferences updated',
    };
  }
}
