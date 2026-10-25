import { Controller, Get, Optional } from '@nestjs/common';
import { LoanEventsConsumer } from '../notifications/loan-events.consumer';

@Controller('health')
export class HealthController {
  constructor(@Optional() private readonly notifications?: LoanEventsConsumer) {}
  @Get()
  health() {
    const notifications = this.notifications?.status() ?? { enabled: false, connected: false };
    return {
      service: 'lams-insight-service',
      status: notifications.enabled && !notifications.connected ? 'DEGRADED' : 'UP',
      notifications,
      timestamp: new Date().toISOString(),
    };
  }
}
