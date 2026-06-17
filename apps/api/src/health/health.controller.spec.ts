import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns the API health status', () => {
    expect(new HealthController().check()).toEqual({
      status: 'ok',
      service: 'wms-scan-api',
    });
  });
});
