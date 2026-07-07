import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  PackageAlertSeverity,
  PackageAlertStatus,
  PackageAlertType,
  PackageExchangePushStatus,
  PackageLogisticsStatus,
  PackageReceivingStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { GoogleSheetsClient } from './google-sheets.client';

const prealertHeaders = [
  '链接',
  '型号',
  '姓名',
  '物流类型',
  '物流单号',
  '预计交付日期',
  '物流查询链接',
  '查询时间',
  '仓库',
  '账单姓名',
  '订单状态',
  '客户',
];

const statusHeaders = [
  '预报ID',
  '物流单号',
  '客户',
  '仓库',
  '入库状态',
  '入库日期',
  '入库时间',
  '送达日期',
  '订单状态',
  '提醒',
  '异常原因',
  '更新时间',
];

const returnStatusReceivedValues = new Set(['RECEIVED', '已收到', '已入库']);
const returnStatusNotReceivedValues = new Set(['NOT_RECEIVED', '未收到', '异常']);

@Injectable()
export class PackagePrealertSheetsSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sheetsClient: GoogleSheetsClient,
  ) {}

  async pushPendingPrealerts() {
    this.assertConfigured();
    const items = await this.prisma.packagePrealertItem.findMany({
      where: {
        exchangePushStatus: {
          in: [PackageExchangePushStatus.PENDING, PackageExchangePushStatus.FAILED],
        },
        receivingStatus: { not: PackageReceivingStatus.VOIDED },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: { batch: true, customer: true },
    });

    let pushed = 0;
    let failed = 0;
    const errors: Array<{ id: string; trackingNo: string; error: string }> = [];

    for (const item of items) {
      try {
        await this.sheetsClient.appendPrealertRows(prealertHeaders, [this.toPrealertRow(item)]);
        await this.prisma.packagePrealertItem.update({
          where: { id: item.id },
          data: {
            exchangePushStatus: PackageExchangePushStatus.PUSHED,
            exchangeRecordId: `${this.sheetsClient.getPrealertSheetName()}:${item.id}`,
            exchangePushedAt: new Date(),
            exchangeSyncError: null,
          },
        });
        pushed += 1;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown Google Sheets push error.';
        await this.prisma.packagePrealertItem.update({
          where: { id: item.id },
          data: {
            exchangePushStatus: PackageExchangePushStatus.FAILED,
            exchangeSyncError: message,
          },
        });
        errors.push({ id: item.id, trackingNo: item.trackingNo, error: message });
        failed += 1;
      }
    }

    return {
      configured: true,
      targetSheet: this.sheetsClient.getPrealertSheetName(),
      scanned: items.length,
      pushed,
      failed,
      errors,
    };
  }

  async pullWarehouseReturns() {
    this.assertConfigured();
    const rows = await this.sheetsClient.readStatusRows();
    const records = this.toStatusRecords(rows);
    let matched = 0;
    let received = 0;
    let alerted = 0;
    let skipped = 0;
    const unmatched: Array<{
      rowNumber: number;
      trackingNo?: string;
      prealertId?: string;
      prealertLink?: string;
    }> = [];

    for (const record of records) {
      const row = this.toReturnRow(record.fields);
      if (!row.prealertId && !row.trackingNo && !row.prealertLink) {
        skipped += 1;
        continue;
      }
      const item = await this.findPrealertForReturn(row);
      if (!item) {
        unmatched.push({
          rowNumber: record.rowNumber,
          trackingNo: row.trackingNo,
          prealertId: row.prealertId,
          prealertLink: row.prealertLink,
        });
        skipped += 1;
        continue;
      }

      const result = this.classifyReturn(row);
      await this.applyReturn(item, row, result);
      matched += 1;
      if (result === 'RECEIVED') {
        received += 1;
      }
      if (result === 'ALERT') {
        alerted += 1;
      }
    }

    return {
      configured: true,
      sourceSheet: this.sheetsClient.getStatusSheetName(),
      scanned: records.length,
      matched,
      received,
      alerted,
      skipped,
      unmatched,
    };
  }

  async syncExchange() {
    const push = await this.pushPendingPrealerts();
    const pull = await this.pullWarehouseReturns();
    return { push, pull };
  }

  template() {
    return {
      spreadsheet: {
        id: '1YUMuLn8acn6S-Bn8-Vn78DzbnOgL0Wmc_XmccApEY5s',
        writeSheet: '预报',
        readSheet: '状态',
        rule: '系统只写“预报”，只读“状态”，不会读写其它 sheet。',
      },
      tables: [
        {
          name: '预报',
          direction: 'WMS 写入，对方读取',
          requiredFields: prealertHeaders,
        },
        {
          name: '状态',
          direction: '对方写入，WMS 读取',
          requiredFields: statusHeaders,
        },
      ],
      matching: '优先使用预报ID，缺失时使用物流单号。',
      alertRule: '订单状态为 DELIVERED 且入库日期为空，或提醒包含“未收到”，系统标记为异常。',
    };
  }

  private assertConfigured() {
    if (!this.sheetsClient.isConfigured()) {
      throw new ServiceUnavailableException('Google Sheets integration is not configured.');
    }
  }

  private toPrealertRow(item: PrealertPushRecord) {
    const hasRealTrackingNo = !this.isOrderReference(item.trackingNo);
    const fields: Record<string, string> = {
      链接: this.isAppleOrderLink(item.originalTrackingLink)
        ? (item.originalTrackingLink ?? '')
        : '',
      型号: item.productModel ?? '',
      姓名: item.recipientName ?? '',
      物流类型: hasRealTrackingNo && item.carrier !== 'UNKNOWN' ? item.carrier : '',
      物流单号: hasRealTrackingNo ? item.trackingNo : '',
      预计交付日期: '',
      物流查询链接: this.toTrackingUrl(item),
      查询时间: this.formatDateTime(new Date()),
      仓库: item.notes ?? item.batch.notes ?? '',
      账单姓名: '',
      订单状态: '',
      客户: item.customer.name || item.customer.code,
    };
    return prealertHeaders.map((header) => fields[header] ?? '');
  }

  private toStatusRecords(rows: string[][]) {
    const [headerRow, ...bodyRows] = rows;
    if (!headerRow) {
      return [];
    }
    return bodyRows.map((row, index) => ({
      rowNumber: index + 2,
      fields: Object.fromEntries(
        headerRow.map((header, colIndex) => [header, row[colIndex] ?? '']),
      ),
    }));
  }

  private toReturnRow(fields: Record<string, unknown>) {
    return {
      prealertId: this.fieldText(fields, '预报ID'),
      trackingNo: this.fieldText(fields, '物流单号')?.replace(/\s+/g, '').toUpperCase(),
      carrier: this.fieldText(fields, '物流类型'),
      trackingLink: this.fieldText(fields, '物流查询链接'),
      prealertLink:
        this.fieldText(fields, '链接') ??
        this.fieldText(fields, '订单链接') ??
        this.fieldText(fields, 'Apple订单链接'),
      customerName: this.fieldText(fields, '客户'),
      warehouse: this.fieldText(fields, '仓库'),
      receivingStatus: this.fieldText(fields, '入库状态'),
      inboundDate: this.fieldText(fields, '入库日期') ?? this.fieldText(fields, '入库时间'),
      deliveredDate: this.fieldText(fields, '送达日期'),
      orderStatus: this.fieldText(fields, '订单状态'),
      reminder: this.fieldText(fields, '提醒'),
      exceptionReason: this.fieldText(fields, '异常原因'),
      updatedAt: this.fieldText(fields, '更新时间'),
    };
  }

  private async findPrealertForReturn(row: WarehouseReturnRow) {
    if (row.prealertId) {
      const item = await this.prisma.packagePrealertItem.findUnique({
        where: { id: row.prealertId },
      });
      if (item) {
        return item;
      }
    }
    if (!row.trackingNo) {
      return this.findPrealertByReturnLink(row.prealertLink);
    }
    const item = await this.prisma.packagePrealertItem.findFirst({
      where: {
        trackingNo: row.trackingNo,
        receivingStatus: { not: PackageReceivingStatus.VOIDED },
      },
      orderBy: { createdAt: 'desc' },
    });
    return item ?? this.findPrealertByReturnLink(row.prealertLink);
  }

  private async findPrealertByReturnLink(link?: string) {
    const trimmed = this.fieldText({ link }, 'link');
    if (!trimmed) {
      return null;
    }
    const appleOrderNo = this.extractAppleOrderNo(trimmed);
    const appleOrderWhere: Prisma.PackagePrealertItemWhereInput[] = appleOrderNo
      ? [
          { trackingNo: `APPLE-${appleOrderNo}` },
          {
            originalTrackingLink: {
              contains: `/vieworder/${appleOrderNo}`,
              mode: Prisma.QueryMode.insensitive,
            },
          },
        ]
      : [];
    return this.prisma.packagePrealertItem.findFirst({
      where: {
        receivingStatus: { not: PackageReceivingStatus.VOIDED },
        OR: [{ originalTrackingLink: trimmed }, ...appleOrderWhere],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private classifyReturn(row: WarehouseReturnRow) {
    const receivingStatus = row.receivingStatus?.toUpperCase();
    if (row.inboundDate || (receivingStatus && returnStatusReceivedValues.has(receivingStatus))) {
      return 'RECEIVED' as const;
    }
    if (
      (receivingStatus && returnStatusNotReceivedValues.has(receivingStatus)) ||
      row.reminder?.includes('未收到') ||
      (row.orderStatus?.toUpperCase() === 'DELIVERED' && !row.inboundDate)
    ) {
      return 'ALERT' as const;
    }
    return 'TOUCHED' as const;
  }

  private async applyReturn(
    item: Awaited<ReturnType<PackagePrealertSheetsSyncService['findPrealertForReturn']>>,
    row: WarehouseReturnRow,
    result: 'RECEIVED' | 'ALERT' | 'TOUCHED',
  ) {
    if (!item) {
      return;
    }
    const deliveredAt = row.deliveredDate ? this.parseDate(row.deliveredDate) : undefined;
    const inboundAt = row.inboundDate ? this.parseDate(row.inboundDate) : undefined;
    const updateData: Prisma.PackagePrealertItemUpdateInput = {
      exchangePulledAt: new Date(),
      exchangeSyncError: null,
      rawLogisticsStatus: row.reminder ?? row.orderStatus,
    };
    const returnedTrackingNo = row.trackingNo;
    if (
      returnedTrackingNo &&
      this.shouldReplaceOrderReference(item.trackingNo, returnedTrackingNo)
    ) {
      updateData.trackingNo = returnedTrackingNo;
      updateData.carrier = this.detectCarrier(returnedTrackingNo, row.trackingLink, row.carrier);
      if (item.receivingStatus !== PackageReceivingStatus.RECEIVED && result !== 'RECEIVED') {
        updateData.exchangePushStatus = PackageExchangePushStatus.PENDING;
      }
    }

    if (deliveredAt || row.orderStatus?.toUpperCase() === 'DELIVERED') {
      updateData.logisticsStatus = PackageLogisticsStatus.DELIVERED;
      updateData.deliveredAt = deliveredAt ?? new Date();
      updateData.logisticsUpdatedAt = row.updatedAt ? this.parseDate(row.updatedAt) : new Date();
    }
    if (result === 'RECEIVED') {
      updateData.receivingStatus = PackageReceivingStatus.RECEIVED;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.packagePrealertItem.update({
        where: { id: item.id },
        data: updateData,
      });
      await tx.packageTrackingEvent.create({
        data: {
          prealertItemId: item.id,
          status:
            updateData.logisticsStatus === PackageLogisticsStatus.DELIVERED
              ? PackageLogisticsStatus.DELIVERED
              : PackageLogisticsStatus.UNKNOWN,
          rawStatus: row.reminder ?? row.orderStatus ?? row.receivingStatus,
          eventTime: inboundAt ?? deliveredAt ?? new Date(),
          location: row.warehouse,
          source: 'GOOGLE_SHEETS_STATUS',
        },
      });

      if (result === 'RECEIVED') {
        await tx.packageAlert.updateMany({
          where: {
            prealertItemId: item.id,
            status: { in: [PackageAlertStatus.OPEN, PackageAlertStatus.IN_PROGRESS] },
          },
          data: {
            status: PackageAlertStatus.RESOLVED,
            resolvedAt: new Date(),
            resolutionNote: 'Google Sheets status sheet confirmed received.',
          },
        });
      }

      if (result === 'ALERT') {
        const existing = await tx.packageAlert.findFirst({
          where: {
            prealertItemId: item.id,
            alertType: PackageAlertType.DELIVERED_NOT_RECEIVED,
            status: { in: [PackageAlertStatus.OPEN, PackageAlertStatus.IN_PROGRESS] },
          },
        });
        if (!existing) {
          await tx.packageAlert.create({
            data: {
              prealertItemId: item.id,
              alertType: PackageAlertType.DELIVERED_NOT_RECEIVED,
              severity: PackageAlertSeverity.CRITICAL,
            },
          });
        }
      }
    });
  }

  private fieldText(fields: Record<string, unknown>, key: string) {
    const value = fields[key];
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value === 'string') {
      return value.trim() || undefined;
    }
    if (typeof value === 'number') {
      return String(value);
    }
    return String(value).trim() || undefined;
  }

  private isAppleOrderLink(link?: string | null) {
    return Boolean(link?.includes('apple.com') && link.includes('/vieworder/'));
  }

  private isOrderReference(trackingNo: string) {
    return trackingNo.startsWith('APPLE-');
  }

  private shouldReplaceOrderReference(currentTrackingNo: string, returnedTrackingNo?: string) {
    if (!returnedTrackingNo || returnedTrackingNo.startsWith('APPLE-')) {
      return false;
    }
    return this.isOrderReference(currentTrackingNo) && currentTrackingNo !== returnedTrackingNo;
  }

  private detectCarrier(trackingNo: string, trackingLink?: string, carrier?: string) {
    const normalizedCarrier = carrier?.trim().toUpperCase();
    if (normalizedCarrier === 'UPS') {
      return 'UPS';
    }
    if (normalizedCarrier === 'USPS') {
      return 'USPS';
    }
    if (normalizedCarrier === 'FEDEX' || normalizedCarrier === 'FEDEX') {
      return 'FEDEX';
    }
    const lowerLink = trackingLink?.toLowerCase() ?? '';
    if (trackingNo.startsWith('1Z') || lowerLink.includes('ups.com')) {
      return 'UPS';
    }
    if (lowerLink.includes('usps.com')) {
      return 'USPS';
    }
    if (lowerLink.includes('fedex.com') || trackingNo.startsWith('9622')) {
      return 'FEDEX';
    }
    return 'UNKNOWN';
  }

  private extractAppleOrderNo(link: string) {
    try {
      const url = new URL(link);
      return url.pathname.match(/\/vieworder\/([A-Z0-9]+)/i)?.[1]?.toUpperCase();
    } catch {
      return link.match(/\/vieworder\/([A-Z0-9]+)/i)?.[1]?.toUpperCase();
    }
  }

  private toTrackingUrl(item: PrealertPushRecord) {
    if (item.originalTrackingLink && !this.isAppleOrderLink(item.originalTrackingLink)) {
      return item.originalTrackingLink;
    }
    const trackingNo = encodeURIComponent(item.trackingNo);
    if (item.carrier === 'UPS') {
      return `https://www.ups.com/track?tracknum=${trackingNo}`;
    }
    if (item.carrier === 'USPS') {
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNo}`;
    }
    if (item.carrier === 'FEDEX') {
      return `https://www.fedex.com/fedextrack/?trknbr=${trackingNo}`;
    }
    return '';
  }

  private parseDate(value: string) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  private formatDateTime(value: Date) {
    return value.toISOString();
  }
}

type PrealertPushRecord = Prisma.PackagePrealertItemGetPayload<{
  include: { batch: true; customer: true };
}>;

type WarehouseReturnRow = ReturnType<PackagePrealertSheetsSyncService['toReturnRow']>;
