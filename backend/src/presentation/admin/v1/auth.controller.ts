import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public } from '../../decorators';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { LoginDto, RefreshTokenDto } from './dto/auth.dto';
import { AuthService } from '../../../modules/auth/auth.service';

@ApiTags('Admin Auth')
@Controller('admin/v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return { data: await this.auth.login(dto.email, dto.password), message: 'Logged in' };
  }

  @Public()
  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto) {
    return {
      data: await this.auth.refresh(dto.refreshToken),
      message: 'Token refreshed',
    };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: { userId: string }) {
    return { data: await this.auth.me(user.userId), message: 'OK' };
  }
}
