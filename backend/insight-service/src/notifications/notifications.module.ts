import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma.module';
import { NotificationRepository } from './notification.repository';
import { LoanEventsConsumer } from './loan-events.consumer';

@Module({ imports: [PrismaModule], providers: [NotificationRepository, LoanEventsConsumer], exports: [LoanEventsConsumer] })
export class NotificationsModule {}
