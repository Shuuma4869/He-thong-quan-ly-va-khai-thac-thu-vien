import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { DiscoveryModule } from './discovery/discovery.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AcquisitionModule } from './acquisition/acquisition.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MetadataModule } from './discovery/metadata/metadata.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DiscoveryModule,
    AnalyticsModule,
    AcquisitionModule,
    NotificationsModule,
    MetadataModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
