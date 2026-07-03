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
- 入库明细导出必须支持按入库状态筛选，默认使用 `已确认入库`，避免待确认、异常或作废明细混入客户对账和飞书登记数据；需要排查问题时才切换为 `全部状态` 或指定异常状态。
- 当入库明细按批次导出时，下载文件名必须包含批次号，方便操作员从浏览器下载记录和导出历史里辨认文件。
- 入库明细的 Excel 导出可选择 `飞书入库登记表`，固定输出 `入库时间`, `单号`, `UPC`,
  `IMEI`, `商品名称`, `数量`，方便客户或飞书表格登记。
- 装箱明细的 Excel 导出默认必须按客户核对样表排版，固定输出 `出库信息`、`SN&IMEI`、`各箱型号汇总`、`出库详情` 四个业务工作表；表头使用 `归属客户` 和 `实际送到地址`，其中 `实际送到地址` 当前固定留空，`SN&IMEI` 明细必须包含每台物品对应的 `单号`，并保持表格数据居中对齐；CSV 导出仍按用户勾选字段输出普通明细行。
- 装箱明细的 Excel 导出可选择 `已装箱汇总表格`，使用与留仓表相同的左侧明细、右侧按箱汇总逻辑；该模式只改变表格布局，不改变 `OUTBOUND_DETAIL` 数据来源或筛选规则。
- 明细下载的装箱明细必须支持从候选箱子中勾选一个或多个箱子，并用 `boxNos` 精确限定预览和导出范围；候选箱子还必须能按箱子类型/尺寸筛选，避免箱子越来越多后只能靠滚动查找。
- 库存明细的 Excel 导出可选择 `未封箱留仓汇总表格`，该模式只导出已装箱但箱子仍未封箱的
  `PACKED + outboundStatus = OPEN` 明细，并按每 24 台自动生成 `留仓箱1`、`留仓箱2` 等虚拟箱号，右侧按 `箱号 + UPC + 型号` 汇总数量。

## Supported Report Types

- `INBOUND_DETAIL`: item-level inbound rows with customer, warehouse, product, scan, and linked inventory status. Excel can use the `飞书入库登记表` layout for the six-column customer registration shape.
- `OUTBOUND_DETAIL`: packed item rows with box, box note, customer, warehouse, product, tracking number, packing time, and sealed time. When operators need sealed box downloads, the report must filter `outboundStatus = SEALED`.
- `INVENTORY_DETAIL`: current item inventory rows exported for operators with the fixed headers
  `单号`, `入库时间`, `UPC`, `IMEI`, `商品名称`, and `数量`. Rows should be grouped by `单号 + UPC + 商品名称`, with
  `数量` summed only across matching rows inside the same tracking number. The same UPC under
  different tracking numbers must remain separate. If a group has quantity greater than one or
  contains multiple IMEI/Serial values, the export should show one summary row followed by one
  detail row per IMEI/Serial value. Detail rows leave `单号`, `入库时间`, `UPC`, `商品名称`, and `数量` blank so
  operators can scan the identities under the merged summary without losing the total.
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
The page should also show a selectable box list for 装箱明细. Customer, date range, search text, and
封箱状态 first narrow the candidate boxes. If no box is selected, preview and export use the broad
filters as before. If one or more boxes are selected, preview and export must include only those
box numbers through `filters.boxNos`. The date range still applies to packed rows inside the
selected boxes, so operators should clear the date range when they need the full detail for the
selected boxes. When customer is `全部客户`, the box list must show customer code/name for each box.
When 装箱明细 is exported as Excel, the export uses a fixed customer-facing workbook layout rather than the selected-field table layout. Operators should use this Excel file for customer reconciliation because it groups SN/IMEI by box, includes each box's uploaded outbound shipment or label number, includes each item's original package/order number, and includes per-box and whole-shipment UPC/model totals.
If operators need an already-packed internal summary, they may choose the `已装箱汇总表格` Excel
layout. This layout lists each packed device as `箱数 / upc / 型号 / imei`, labels boxes as
`已装箱1`, `已装箱2`, and summarizes `箱号 + UPC + 型号` quantities on the right side with a final
total.

For 未封箱留仓明细, operators should choose `库存明细` + `Excel` + `未封箱留仓汇总表格`. The
page sends `inventoryStatus = PACKED` and `outboundStatus = OPEN`, then the export groups the
selected inventory rows into 24-unit virtual boxes named `留仓箱1`, `留仓箱2`, and so on. This
matches the operational need to review items already placed into boxes but not yet sealed.

The outbound packing page may also provide `下载全部数据` for the selected customer/warehouse and a
per-box `下载数据` shortcut for customer-service order creation before final sealing. These shortcuts
should export `OUTBOUND_DETAIL` Excel without requiring `outboundStatus = SEALED`; the sealing
workflow still requires photo or video evidence.

For 入库明细, the page should offer an 入库批次 selector and an 入库状态 selector. Operators can
download all inbound detail rows or restrict the export to one confirmed batch; selected-batch
downloads should be named by batch number. The page defaults 入库状态 to `已确认入库` and only
includes other statuses when the operator intentionally chooses `全部状态`, `待确认`, `异常`, or
`已作废`.
When the operator chooses `Excel` + `飞书入库登记表`, the generated file should use the fixed
headers `入库时间`, `单号`, `UPC`, `IMEI`, `商品名称`, `数量` regardless of the preview field list.

The page time filter should send `dateFrom` and `dateTo` as ISO datetimes and require a fresh preview after the operator changes the time range. End time must not be earlier than start time.
