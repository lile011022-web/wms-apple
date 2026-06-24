# Report Rules

Reports provide traceable downloads for operational review, customer reconciliation, and audit investigation.

## Business Rules

- Operators must select a report type before previewing or exporting.
- Every report type has a fixed field whitelist.
- Requested fields outside the whitelist must be rejected.
- Filters may include customer, warehouse, product, date range, UPC, IMEI, Serial, UPS tracking number, status, and search text when applicable.
- Preview must return estimated row count before export creation.
- Preview should include a small sample of formatted rows so operators can confirm the upcoming download content before creating the file.
- Small exports can complete synchronously.
- Large exports must be routed to a background job before production use.
- Export history is scoped to the requesting user.
- Download is allowed only for the user who created the export.
- Only completed exports can be downloaded.
- Every successful export must create a `REPORT_EXPORT` audit log.
- 入库明细导出必须支持按已确认入库批次筛选下载，避免多天、多批次扫描后只能靠日期或搜索词定位。
- 当入库明细按批次导出时，下载文件名必须包含批次号，方便操作员从浏览器下载记录和导出历史里辨认文件。
- 装箱明细的 Excel 导出必须按客户核对样表排版，固定输出 `出库信息`、`SN&IMEI`、`各箱型号汇总`、`出库详情` 四个业务工作表；CSV 导出仍按用户勾选字段输出普通明细行。

## Supported Report Types

- `INBOUND_DETAIL`: item-level inbound rows with customer, warehouse, product, scan, and linked inventory status.
- `OUTBOUND_DETAIL`: packed item rows with box, box note, customer, warehouse, product, tracking number, packing time, and sealed time. When operators need sealed box downloads, the report must filter `outboundStatus = SEALED`.
- `INVENTORY_DETAIL`: current item inventory rows with ownership, warehouse, product, IMEI, Serial, status, and latest box.
- `EXCEPTION_DETAIL`: exception rows with type, status, raw value, ownership, product, and resolution fields.
- `CUSTOMER_CHANGE_LOG`: batch customer-change logs with old customer, new customer, operator, reason, and affected count.
- `AUDIT_LOG`: critical operation logs with action, resource, operator, request ID, and timestamp.

## Page Usage

The detail-download page should:

1. Select a report type.
2. Apply filters, including optional start and end time.
3. Select fields from the allowed field list.
4. Preview estimated row count.
5. Review a small sample table of the rows and selected columns that will be exported.
6. Create a CSV or Excel export.
7. Show export history and status.
8. Download completed exports or re-create an export from history.

For 装箱明细, the default page workflow should offer `仅已封箱` so customer-facing downloads do not include open boxes still being edited.
When 装箱明细 is exported as Excel, the export uses a fixed customer-facing workbook layout rather than the selected-field table layout. Operators should use this Excel file for customer reconciliation because it groups SN/IMEI by box and includes per-box and whole-shipment UPC/model totals.

For 入库明细, the page should offer an 入库批次 selector. Operators can download all inbound detail rows or restrict the export to one confirmed batch; selected-batch downloads should be named by batch number.

The page time filter should send `dateFrom` and `dateTo` as ISO datetimes and require a fresh preview after the operator changes the time range. End time must not be earlier than start time.
