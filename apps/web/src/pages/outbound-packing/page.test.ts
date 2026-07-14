import { describe, expect, it } from 'vitest';
import { buildPrintDetailLines, getCreatedBoxViewDateRange } from './page';

describe('outbound created box date range', () => {
  it('converts a custom warehouse date into the complete Los Angeles business day', () => {
    expect(
      getCreatedBoxViewDateRange('CUSTOM_RANGE', 'America/Los_Angeles', '2026-07-11', '2026-07-11'),
    ).toEqual({
      label: '2026-07-11 至 2026-07-11',
      createdFrom: '2026-07-11T07:00:00.000Z',
      createdTo: '2026-07-12T06:59:59.999Z',
      invalid: false,
    });
  });

  it('supports a one-sided custom range', () => {
    expect(
      getCreatedBoxViewDateRange('CUSTOM_RANGE', 'America/Los_Angeles', '2026-07-11'),
    ).toMatchObject({
      label: '从 2026-07-11',
      createdFrom: '2026-07-11T07:00:00.000Z',
      createdTo: undefined,
      invalid: false,
    });
  });

  it('blocks a reversed custom range before querying', () => {
    expect(
      getCreatedBoxViewDateRange('CUSTOM_RANGE', 'America/Los_Angeles', '2026-07-12', '2026-07-11'),
    ).toMatchObject({
      createdFrom: undefined,
      createdTo: undefined,
      invalid: true,
    });
  });
});

describe('outbound box print detail', () => {
  it('prints the date and customer once, then keeps the short box label on its own line', () => {
    const lines = buildPrintDetailLines({
      createdAt: '2026-07-10T12:00:00',
      boxNo: 'BOX-2',
      name: 'chen20260710第一批手机箱2',
      items: [
        {
          productName: 'iphone 17 pro max, silver, 256gb',
          customerName: 'wangchen',
        },
      ],
      raw: { customer: { name: 'wangchen' } },
    } as never);

    expect(lines[0]).toBe('7.10 wangchen');
    expect(lines[0]).not.toContain('箱2');
    expect(lines[1]).toBe('箱2');
    expect(lines).toContain('iphone 17 pro max, silver, 256gb*1');
  });
});
