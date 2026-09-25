import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { DiscoveryModule } from './discovery/discovery.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AcquisitionModule } from './acquisition/acquisition.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DiscoveryModule,
    AnalyticsModule,
    AcquisitionModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
