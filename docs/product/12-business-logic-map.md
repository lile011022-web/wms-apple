# Business Logic Map

这份文档用于从业务角度检查 WMS Scan 的整体步骤、关键判断点和状态流转是否合理。

## Overall Flow

```mermaid
flowchart TD
  A[基础资料准备] --> A1[客户资料启用]
  A --> A2[UPC 商品库启用]
  A --> A3[仓库和系统设置]

  A1 --> B[入库扫码]
  A2 --> B
  A3 --> B

  B --> B1{是否已锁定客户}
  B1 -- 否 --> B2[阻止扫码或要求先选择客户]
  B1 -- 是 --> B3[扫描物流单号 UPC IMEI 或 Serial]

  B3 --> B4{UPC 是否匹配启用商品}
  B4 -- 否 --> E1[创建或显示 UPC_NOT_MATCHED 异常]
  B4 -- 是 --> B5{IMEI 或 Serial 是否符合商品规则且唯一}

  B5 -- 否 --> E2[创建或显示 IMEI_DUPLICATED 等异常]
  B5 -- 是 --> B6[加入入库草稿待确认]

  B6 --> B7[操作员检查入库汇总]
  B7 --> B8{最终确认入库}
  B8 -- 否 --> B9[继续修改 删除 或补扫草稿行]
  B9 --> B7
  B8 -- 是 --> C[生成客户库存 IN_STOCK]

  C --> C1[客户库存查询 SKU 汇总 IMEI 明细]
  C --> D[出库装箱]
  C --> F[报表导出]

  D --> D1{选择客户和仓库}
  D1 --> D2[创建或选择 OPEN 箱]
  D2 --> D3{库存是否属于同客户同仓库且为 IN_STOCK}
  D3 -- 否 --> E3[阻止装箱或进入异常排查]
  D3 -- 是 --> D4[加入箱子 库存变为 PACKED]
  D4 --> D5{是否封箱}
  D5 -- 否 --> D6[可移除 清空 编辑 继续装箱]
  D6 --> D4
  D5 -- 是 --> D7{是否已上传装箱照片或视频}
  D7 -- 否 --> D8[阻止封箱 补充证据]
  D7 -- 是 --> D9[箱子变为 SEALED 库存保持 PACKED]

  E1 --> E[异常池]
  E2 --> E
  E3 --> E
  E --> E4{人工处理}
  E4 --> E5[解决 忽略 或作废 并写审计]

  C --> G[批量客户变更]
  G --> G1{是否仍是已确认且未 PACKED/OUTBOUND 库存}
  G1 -- 否 --> G2[阻止变更]
  G1 -- 是 --> G3[预览 令牌校验 填写原因]
  G3 --> G4[更新入库 库存 异常归属并记录日志]

  B8 --> H[审计日志]
  D4 --> H
  D9 --> H
  E5 --> H
  G4 --> H
  F --> H
```

## Inbound Detail

```mermaid
flowchart TD
  A[开始入库] --> B[选择并锁定客户]
  B --> C[选择仓库和入库模式]
  C --> D[扫描物流单号]
  D --> D1{物流单号是否自动放行}
  D1 -- UPS 或 9622 FedEx 22-34 位 --> E[继续扫描 UPC]
  D1 -- USPS 非 9622 FedEx 其它或重复 --> D2[暂停并要求操作员确认]
  D2 --> E

  E --> F{UPC 匹配启用商品}
  F -- 否 --> X1[草稿异常行 UPC_NOT_MATCHED]
  F -- 是 --> G{商品是否要求 IMEI}

  G -- 是 --> H{IMEI 是否有效}
  G -- 否 --> I{IMEI 或 Serial 是否提供其一}
  H -- 否 --> X2[草稿异常行]
  H -- 是 --> J{IMEI 是否唯一}
  I -- 否 --> X2
  I -- 是 --> J

  J -- 否 --> X3[草稿异常行 IMEI_DUPLICATED]
  J -- 是 --> K[草稿 PENDING 行]

  X1 --> L[最新异常行必须先修正或删除]
  X2 --> L
  X3 --> L
  L --> M[行内编辑后重跑同一套校验]
  M --> F

  K --> N[入库汇总复核]
  N --> O{点击确认入库}
  O -- 否 --> P[继续补扫或编辑草稿]
  P --> N
  O -- 是 --> Q[事务重检重复 IMEI Serial 物流单号]
  Q --> R{是否全部可确认}
  R -- 否 --> S[保留草稿 阻止部分错误写入库存]
  R -- 是 --> T[创建 InboundBatch InboundItem InventoryItem]
  T --> U[库存状态 IN_STOCK]
  U --> V[写 INBOUND_CONFIRM 审计]
```

## Inventory And Outbound Detail

```mermaid
flowchart TD
  A[客户库存 IN_STOCK] --> B[库存查询和 SKU 汇总]
  A --> C[出库工作台选择客户和仓库]
  C --> D[创建 OPEN 箱]

  D --> E{装箱方式}
  E -- 逐一扫码 --> F[扫描 UPC 和 IMEI/Serial]
  E -- 批量装箱 --> G[筛选可用库存 勾选或按筛选结果分箱]

  F --> H{UPC 与 IMEI/Serial 是否指向同一条库存}
  G --> I{分箱数量是否等于选中或筛选总数}

  H -- 否 --> X1[停止扫描 等待清空或修正]
  H -- 是 --> J{同客户 同仓库 IN_STOCK}
  I -- 否 --> X2[阻止提交]
  I -- 是 --> J

  J -- 否 --> X3[阻止装箱]
  J -- 是 --> K[加入 OutboundBoxItem]
  K --> L[库存 IN_STOCK 变 PACKED]
  L --> M[可打印箱内明细]
  M --> N{是否封箱}

  N -- 否 --> O[继续加货 移除 清空 编辑箱信息 上传证据]
  O --> M
  N -- 是 --> P{是否有照片或视频证据}
  P -- 否 --> Q[阻止封箱]
  P -- 是 --> R[箱子 OPEN 变 SEALED]
  R --> S[库存当前仍保持 PACKED]
  S --> T[写 OUTBOUND_BOX_SEAL 审计]

  R --> U{是否需要返工}
  U -- 是 --> V[重开 SEALED 为 OPEN]
  V --> O
  U -- 否 --> W[等待后续最终出库流程]
```

## Inventory State Machine

```mermaid
stateDiagram-v2
  [*] --> IN_STOCK: 入库确认
  IN_STOCK --> PACKED: 加入 OPEN 出库箱
  PACKED --> IN_STOCK: 从 OPEN 箱移除或清空
  PACKED --> PACKED: 封箱后当前阶段仍保持 PACKED
  PACKED --> OUTBOUND: 后续最终出库流程
  IN_STOCK --> EXCEPTION: 库存异常
  PACKED --> EXCEPTION: 装箱后异常
  EXCEPTION --> IN_STOCK: 异常解决并恢复
  IN_STOCK --> VOIDED: 作废
  PACKED --> VOIDED: 作废
  EXCEPTION --> VOIDED: 异常作废
```

## Correction And Exception Paths

```mermaid
flowchart TD
  A[发现错误] --> B{错误类型}
  B -- 草稿内错误 --> C[入库草稿行内编辑或删除]
  B -- 已确认入库字段错误 --> D[入库记录页修正物流单号 UPC IMEI/Serial]
  B -- 异常行但应入库 --> E[强制入库]
  B -- 客户归属错误 --> F[批量客户变更]
  B -- 单纯异常处理 --> G[异常池处理]

  D --> D1{库存是否仍 IN_STOCK 且未装箱}
  D1 -- 否 --> D2[阻止修正]
  D1 -- 是 --> D3[同步修正入库记录和库存并写审计]

  E --> E1{UPC 已匹配且 IMEI/Serial 不重复}
  E1 -- 否 --> E2[阻止强制入库]
  E1 -- 是 --> E3[创建库存 解决异常 写审计]

  F --> F1[筛选候选记录]
  F1 --> F2[预览影响和阻断项]
  F2 --> F3{记录是否仍属于原客户且未 PACKED/OUTBOUND}
  F3 -- 否 --> F4[阻止提交 要求重新预览]
  F3 -- 是 --> F5[填写原因 提交 previewToken]
  F5 --> F6[同步更新入库 库存 异常归属 写 CustomerChangeLog 和审计]

  G --> G1{异常是否 OPEN}
  G1 -- 否 --> G2[不可再处理]
  G1 -- 是 --> G3[解决 忽略 或作废 必填说明 写审计]
```

## Logic Checkpoints

1. 客户归属只能在入库前锁定；出库不能重新分配客户。
2. UPC 是商品识别入口；未匹配启用商品时不能生成正常库存。
3. IMEI/Serial 是单件追踪入口；重复值不能进入库存，即使强制入库也不能绕过。
4. 入库确认必须是最终人工点击，不能由扫码或文件导入自动确认。
5. 入库草稿异常行必须先修正或删除，避免操作员带着错误继续扫下一行。
6. 出库只能操作同客户、同仓库、`IN_STOCK` 库存。
7. 装箱后库存变为 `PACKED`；当前系统封箱后仍保持 `PACKED`，`OUTBOUND` 留给后续最终出库流程。
8. 封箱必须有照片或视频证据。
9. 已 `PACKED` 或 `OUTBOUND` 的库存不能批量改客户，也不能通过入库记录修正静默改历史。
10. 异常处理、批量改客户、入库确认、封箱、报表导出都必须写审计日志。

## Potential Questions To Confirm

1. 当前封箱后库存保持 `PACKED`，不是立即变 `OUTBOUND`。如果业务上“封箱=已经出库”，需要新增最终出库规则或调整状态机。
2. 重复物流单号在同一草稿内允许，因为一个包裹可以有多件货；但历史已确认重复会产生异常信号。这个规则需要现场确认是否符合实际收货。
3. `物流+UPC 模式` 允许没有 IMEI/Serial 的草稿行，但确认入库时仍受商品规则和唯一性校验约束。若现场希望这种模式直接生成无 IMEI 库存，需要单独明确适用商品范围。
4. 批量客户变更只能处理未装箱或未出库库存。如果现场经常在装箱后发现客户错误，应先设计“重开/移除/改客户/重新装箱”的标准操作。
