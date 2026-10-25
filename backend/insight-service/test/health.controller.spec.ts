import { Test } from '@nestjs/testing';
import { HealthController } from '../src/health/health.controller';
import { LoanEventsConsumer } from '../src/notifications/loan-events.consumer';

describe('HealthController', () => {
  it('trả trạng thái của chính service', async () => {
    const module = await Test.createTestingModule({ controllers: [HealthController] }).compile();
    const result = module.get(HealthController).health();
    expect(result.service).toBe('lams-insight-service');
    expect(result.status).toBe('UP');
  });
  it('báo DEGRADED khi consumer đã bật nhưng chưa kết nối', async () => {
    const module = await Test.createTestingModule({ controllers: [HealthController], providers: [{ provide: LoanEventsConsumer,
      useValue: { status: () => ({ enabled: true, connected: false }) } }] }).compile();
    expect(module.get(HealthController).health()).toMatchObject({ status: 'DEGRADED', notifications: { enabled: true, connected: false } });
    await module.close();
  });
});
