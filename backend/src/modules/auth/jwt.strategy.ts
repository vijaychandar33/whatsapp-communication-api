import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppConfigurationService } from '../../infrastructure/config/configuration.service';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  organizationId: string;
  type: 'access';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: AppConfigurationService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get().jwtSecret,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null, status: 'ACTIVE' },
    });
    if (!user) {
      throw new UnauthorizedException('User not found or inactive');
    }
    return {
      userId: user.id,
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
    };
  }
}
