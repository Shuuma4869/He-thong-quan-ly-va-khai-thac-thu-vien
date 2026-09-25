import { Test } from '@nestjs/testing';
import { HealthController } from '../src/health/health.controller';

describe('HealthController', () => {
  it('trả trạng thái của chính service', async () => {
    const module = await Test.createTestingModule({ controllers: [HealthController] }).compile();
    const result = module.get(HealthController).health();
    expect(result.service).toBe('lams-insight-service');
    expect(result.status).toBe('UP');
  });
});
