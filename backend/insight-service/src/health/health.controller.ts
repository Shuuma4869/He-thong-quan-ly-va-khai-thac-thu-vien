import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return {
      service: 'lams-insight-service',
      status: 'UP',
      timestamp: new Date().toISOString(),
    };
  }
}
