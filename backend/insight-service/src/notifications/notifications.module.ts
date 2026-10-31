import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma.module';
import { NotificationRepository } from './notification.repository';
import { LoanEventsConsumer } from './loan-events.consumer';
import { NotificationController } from './notification.controller';
import { NotificationGuard } from './notification.guard';
import { StaffWorkInboxController } from './staff-work-inbox.controller';
import { StaffWorkInboxGuard } from './staff-work-inbox.guard';
import { LoanDueReminderJob } from './loan-due-reminder.job';

@Module({ imports: [PrismaModule], controllers: [NotificationController, StaffWorkInboxController],
  providers: [NotificationRepository, LoanEventsConsumer, NotificationGuard, StaffWorkInboxGuard, LoanDueReminderJob],
  exports: [LoanEventsConsumer] })
export class NotificationsModule {}
