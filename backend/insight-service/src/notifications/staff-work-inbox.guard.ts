import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { notificationRoles } from './notification.guard';

@Injectable()
export class StaffWorkInboxGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const roles = (request as Request & { [notificationRoles]?: string[] })[notificationRoles] ?? [];
    if (!roles.some(role => role === 'LIBRARIAN' || role === 'ADMIN'))
      throw new ForbiddenException('Chỉ Librarian hoặc Admin được xem work inbox.');
    return true;
  }
}
