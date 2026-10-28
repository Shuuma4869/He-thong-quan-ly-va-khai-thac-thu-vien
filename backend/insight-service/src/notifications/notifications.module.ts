import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma.module';
import { NotificationRepository } from './notification.repository';
import { LoanEventsConsumer } from './loan-events.consumer';
import { NotificationController } from './notification.controller';
import { NotificationGuard } from './notification.guard';

@Module({ imports: [PrismaModule], controllers: [NotificationController],
  providers: [NotificationRepository, LoanEventsConsumer, NotificationGuard], exports: [LoanEventsConsumer] })
export class NotificationsModule {}
