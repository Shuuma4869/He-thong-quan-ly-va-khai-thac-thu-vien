import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { NotificationGuard } from './notification.guard';
import { NotificationRepository } from './notification.repository';
import { StaffWorkInboxGuard } from './staff-work-inbox.guard';

class StaffWorkItemsQuery {
  @Type(() => Number) @IsInt() @Min(0) @Max(10000) page = 0;
  @Type(() => Number) @IsInt() @Min(1) @Max(50) size = 20;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsIn(['WAITING', 'READY']) workType?: 'WAITING' | 'READY';
}
class BranchQuery {
  @IsOptional() @IsUUID() branchId?: string;
}

@Controller('staff/work-items')
@UseGuards(NotificationGuard, StaffWorkInboxGuard)
export class StaffWorkInboxController {
  constructor(private readonly repository: NotificationRepository) {}

  @Get() @Header('Cache-Control', 'no-store')
  list(@Query() query: StaffWorkItemsQuery) {
    return this.repository.listStaffWorkItems(query);
  }

  @Get('unread-count') @Header('Cache-Control', 'no-store')
  unreadCount(@Query() query: BranchQuery) {
    return this.repository.staffWorkUnreadCount(query.branchId);
  }
}
