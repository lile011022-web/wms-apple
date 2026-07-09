import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PackagePrealertsEnabledGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate() {
    const value = this.configService.get<string>('PACKAGE_PREALERTS_ENABLED') ?? 'false';
    const enabled = ['true', '1', 'yes'].includes(value.toLowerCase());
    if (!enabled) {
      throw new NotFoundException('Package prealerts are currently disabled.');
    }
    return true;
  }
}
