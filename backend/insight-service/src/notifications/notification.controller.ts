import { Controller, Get, Header, HttpCode, NotFoundException, Param, ParseUUIDPipe,
  Patch, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import type { Request } from 'express';
import { NotificationGuard, notificationActor } from './notification.guard';
import { NotificationRepository } from './notification.repository';

class PageQuery {
  @Type(() => Number) @IsInt() @Min(0) @Max(10000) page = 0;
  @Type(() => Number) @IsInt() @Min(1) @Max(50) size = 20;
}

@Controller('me/notifications')
@UseGuards(NotificationGuard)
export class NotificationController {
  constructor(private readonly repository: NotificationRepository) {}

  private owner(request: Request) {
    const id = (request as Request & { [notificationActor]?: string })[notificationActor];
    if (!id) throw new UnauthorizedException('Phiên đăng nhập không hợp lệ.');
    return id;
  }

  @Get() @Header('Cache-Control', 'no-store')
  list(@Req() request: Request, @Query() query: PageQuery) {
    return this.repository.list(this.owner(request), query.page, query.size);
  }

  @Get('unread-count') @Header('Cache-Control', 'no-store')
  unreadCount(@Req() request: Request) {
    return this.repository.unreadCount(this.owner(request));
  }

  @Patch(':id/read') @HttpCode(204) @Header('Cache-Control', 'no-store')
  async markRead(@Req() request: Request, @Param('id', new ParseUUIDPipe()) id: string) {
    const result = await this.repository.markRead(this.owner(request), id);
    if (result === 'NOT_FOUND') throw new NotFoundException('Không tìm thấy thông báo.');
  }
}
