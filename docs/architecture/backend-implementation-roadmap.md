# Backend Implementation Roadmap

## 01 文档目的

这份文档用于指导 WMS Scan 后端从当前 NestJS 骨架开始，按前端页面功能逐个实现，直到部署服务器上线。

后续搭建目录、拆任务、维护代码时，优先按本文标题定位。每个阶段都必须保持小步交付，不一次性实现全部功能。

## 02 当前项目基线

当前项目已经具备：

- `apps/web`: React + Vite + TypeScript 前端应用，已有 11 个页面入口。
- `apps/api`: NestJS + TypeScript 后端应用，已有配置、健康检查、Swagger、全局异常过滤器、请求 ID 拦截器和业务模块骨架。
- `packages/shared`: 前后端共享枚举、扫码校验、API 响应类型。
- `docs/ui-prototype/original-html`: 原始高保真 HTML 原型，作为产品和 UI 参考，禁止删除。

当前后端主要缺口：

- Prisma schema 只有最小 `User` 模型，业务实体还未完整建模。
- 业务模块只有 module/service 骨架，缺少 controller、repository、dto、tests。
- 还未形成完整 API 合同、数据库模型文档、部署文档和上线检查清单。

## 03 后端维护总目录标题

后端代码固定维护在：

```text
apps/api/src/
  common/                 # 通用错误、过滤器、拦截器、管道、守卫、装饰器
  config/                 # 环境变量、应用、数据库、Redis、JWT 配置
  database/               # Prisma 连接边界
  health/                 # 健康检查
  jobs/                   # 队列和后台任务
  modules/
    auth/                 # 登录、登出、令牌、当前用户
    users/                # 用户账号
    roles/                # 角色
    permissions/          # 权限点
    warehouses/           # 仓库资料
    customers/            # 客户管理
    products/             # UPC 商品库
    inbound/              # 入库扫码和入库确认
    inventory/            # 客户库存、IMEI 状态
    outbound/             # 出库装箱、箱号、封箱
    exceptions/           # 异常池和异常处理
    reports/              # 明细下载和导出任务
    audit-logs/           # 审计日志
    settings/             # 系统设置、扫码规则、保留策略
```

共享规则固定维护在：

```text
packages/shared/src/
  enums/                  # 前后端共享枚举
  types/                  # 前后端共享类型
  validators/             # UPS、UPC、IMEI、Serial 扫码校验
  constants/              # 稳定业务常量
```

文档固定维护在：

```text
docs/api/                 # API 合同、请求响应、错误码
docs/database/            # 数据库模型、状态流转、迁移说明
docs/product/             # 产品规则和业务说明
docs/architecture/        # 架构、模块边界、开发路线
docs/changelog/           # 每次交付记录
infra/                    # Docker、部署、服务器基础设施
```

## 04 标准业务模块标题

每个业务模块按同一结构维护：

```text
apps/api/src/modules/<module-name>/
  <module-name>.module.ts
  <module-name>.controller.ts
  <module-name>.service.ts
  <module-name>.repository.ts
  dto/
  entities/
  constants/
  tests/
```

职责边界：

- `controller`: 只处理 HTTP 路由、认证、权限、DTO 绑定。
- `service`: 处理业务规则、状态流转、事务编排。
- `repository`: 只处理数据库读写。
- `dto`: 请求和响应结构。
- `entities`: 模块内部领域对象。
- `constants`: 模块内部常量。
- `tests`: 关键业务测试。

## 05 阶段一：后端基础工程加固

对应页面：全部页面共用。

后端目录：

- `apps/api/src/common`
- `apps/api/src/config`
- `apps/api/src/database`
- `apps/api/src/health`

要完成的内容：

- <strong><font color="red">🔴 已完成：完善统一响应和错误码规则。</font></strong>
- <strong><font color="red">🔴 已完成：补齐认证失败、权限失败、业务失败、参数失败、系统失败的错误格式。</font></strong>
- <strong><font color="red">🔴 已完成：确认 Swagger 分组、接口 tag 和全局 Bearer Auth。</font></strong>
- <strong><font color="red">🔴 已完成：统一分页、排序、搜索参数 DTO。</font></strong>
- <strong><font color="red">🔴 已完成：接入 Prisma Client 生成脚本。</font></strong>
- <strong><font color="red">🔴 已完成：明确本地 PostgreSQL、Redis 启动方式。</font></strong>

文档同步：

- <strong><font color="red">🔴 已完成：`docs/api/01-rest-conventions.md`。</font></strong>
- <strong><font color="red">🔴 已完成：`docs/api/02-error-codes.md`。</font></strong>
- <strong><font color="red">🔴 已完成：`docs/database/01-database-overview.md`。</font></strong>

测试重点：

- <strong><font color="red">🔴 已完成：`GET /api/v1/health`。</font></strong>
- <strong><font color="red">🔴 已完成：参数校验失败格式。</font></strong>
- <strong><font color="red">🔴 已完成：业务异常格式。</font></strong>
- <strong><font color="red">🔴 已完成：requestId 是否贯穿错误响应。</font></strong>

验收标准：

- <strong><font color="red">🔴 已完成：API 可启动。</font></strong>
- <strong><font color="red">🔴 已完成：Swagger 可打开。</font></strong>
- <strong><font color="red">🔴 已完成：健康检查可用。</font></strong>
- <strong><font color="red">🔴 已完成：错误响应结构稳定，前端可以统一处理。</font></strong>

## 06 阶段二：数据库核心模型设计

对应页面：全部页面共用。

后端目录：

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations`
- `apps/api/prisma/seed.ts`

核心模型标题：

- <strong><font color="red">🔴 已完成：`User`: 用户。</font></strong>
- <strong><font color="red">🔴 已完成：`Role`: 角色。</font></strong>
- <strong><font color="red">🔴 已完成：`Permission`: 权限点。</font></strong>
- <strong><font color="red">🔴 已完成：`Warehouse`: 仓库。</font></strong>
- <strong><font color="red">🔴 已完成：`Customer`: 客户。</font></strong>
- <strong><font color="red">🔴 已完成：`Product`: UPC 商品。</font></strong>
- <strong><font color="red">🔴 已完成：`InboundBatch`: 入库批次或入库确认单。</font></strong>
- <strong><font color="red">🔴 已完成：`InboundItem`: 入库明细，绑定 UPS、UPC、IMEI、Serial、客户。</font></strong>
- <strong><font color="red">🔴 已完成：`InventoryItem`: 库存单件，以 IMEI 或 Serial 为核心追踪对象。</font></strong>
- <strong><font color="red">🔴 已完成：`OutboundBox`: 出库箱。</font></strong>
- <strong><font color="red">🔴 已完成：`OutboundBoxItem`: 箱内明细。</font></strong>
- <strong><font color="red">🔴 已完成：`ExceptionRecord`: 异常记录。</font></strong>
- <strong><font color="red">🔴 已完成：`CustomerChangeLog`: 批量客户修改日志。</font></strong>
- <strong><font color="red">🔴 已完成：`ReportExport`: 报表导出历史。</font></strong>
- <strong><font color="red">🔴 已完成：`AuditLog`: 审计日志。</font></strong>
- <strong><font color="red">🔴 已完成：`SystemSetting`: 系统设置。</font></strong>

关键状态标题：

- <strong><font color="red">🔴 已完成：`InventoryStatus`: `IN_STOCK`、`PACKED`、`OUTBOUND`、`EXCEPTION`、`VOIDED`。</font></strong>
- <strong><font color="red">🔴 已完成：`ExceptionStatus`: `OPEN`、`RESOLVED`、`IGNORED`、`INVALID`。</font></strong>
- <strong><font color="red">🔴 已完成：`OutboundBoxStatus`: `OPEN`、`SEALED`、`VOIDED`。</font></strong>
- <strong><font color="red">🔴 已完成：`ReportExportStatus`: `PENDING`、`PROCESSING`、`COMPLETED`、`FAILED`。</font></strong>

文档同步：

- <strong><font color="red">🔴 已完成：`docs/database/02-entity-relationship.md`。</font></strong>
- <strong><font color="red">🔴 已完成：`docs/database/03-inventory-state-machine.md`。</font></strong>
- <strong><font color="red">🔴 已完成：`docs/database/04-audit-log-schema.md`。</font></strong>

测试重点：

- <strong><font color="red">🔴 已完成：Prisma schema 可 generate。</font></strong>
- <strong><font color="red">🔴 已完成：已生成初始 migration SQL，待连接空库执行验证。</font></strong>
- <strong><font color="red">🔴 已完成：seed 可创建开发账号、默认仓库、默认角色、测试客户和测试 UPC。</font></strong>

验收标准：

- <strong><font color="red">🔴 已完成：已具备数据库初始化 schema、migration SQL 和 seed，待本地 PostgreSQL 执行验证。</font></strong>
- <strong><font color="red">🔴 已完成：核心表结构支持全部前端页面。</font></strong>
- <strong><font color="red">🔴 已完成：所有关键写操作有审计字段或审计日志关联能力。</font></strong>

## 07 阶段三：认证、用户、角色、权限

对应页面：

- 系统设置：用户与权限。
- Dashboard：最近操作日志需要当前操作员。

后端目录：

- `apps/api/src/modules/auth`
- `apps/api/src/modules/users`
- `apps/api/src/modules/roles`
- `apps/api/src/modules/permissions`

要完成的内容：

- <strong><font color="red">🔴 已完成：登录、登出、刷新令牌。</font></strong>
- <strong><font color="red">🔴 已完成：查询当前用户。</font></strong>
- <strong><font color="red">🔴 已完成：用户列表、新增用户、编辑用户、停用用户。</font></strong>
- <strong><font color="red">🔴 已完成：角色列表、角色授权。</font></strong>
- <strong><font color="red">🔴 已完成：权限守卫和权限装饰器。</font></strong>
- <strong><font color="red">🔴 已完成：登录登出写入审计日志。</font></strong>

建议接口标题：

- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /users`
- `POST /users`
- `PATCH /users/:id`
- `GET /roles`
- `PATCH /roles/:id/permissions`

文档同步：

- <strong><font color="red">🔴 已完成：`docs/api/03-auth.md`。</font></strong>
- <strong><font color="red">🔴 已完成：`docs/api/04-users-roles-permissions.md`。</font></strong>

测试重点：

- <strong><font color="red">🔴 已完成：密码不明文保存。</font></strong>
- <strong><font color="red">🔴 已完成：停用用户不可登录。</font></strong>
- <strong><font color="red">🔴 已完成：无权限用户不能访问关键写接口。</font></strong>
- <strong><font color="red">🔴 已完成：登录和登出生成 audit log。</font></strong>

验收标准：

- <strong><font color="red">🔴 已完成：前端可基于 `/auth/me` 判断登录状态。</font></strong>
- <strong><font color="red">🔴 已完成：系统设置页面可展示并维护用户和角色。</font></strong>

## 08 阶段四：仓库与系统设置

对应页面：

- 系统设置：仓库信息、扫码规则、异常处理、通知设置、数据保留。

后端目录：

- `apps/api/src/modules/warehouses`
- `apps/api/src/modules/settings`

要完成的内容：

- <strong><font color="red">🔴 已完成：查询和更新仓库资料。</font></strong>
- <strong><font color="red">🔴 已完成：查询和更新扫码规则。</font></strong>
- <strong><font color="red">🔴 已完成：查询和更新异常处理配置。</font></strong>
- <strong><font color="red">🔴 已完成：查询和更新通知设置。</font></strong>
- <strong><font color="red">🔴 已完成：查询和更新数据保留策略。</font></strong>
- <strong><font color="red">🔴 已完成：设置变更写入审计日志。</font></strong>

建议接口标题：

- `GET /warehouses`
- `POST /warehouses`
- `PATCH /warehouses/:id`
- `GET /settings`
- `PATCH /settings`

文档同步：

- <strong><font color="red">🔴 已完成：`docs/api/05-warehouses-settings.md`。</font></strong>
- <strong><font color="red">🔴 已完成：`docs/product/02-system-settings-rules.md`。</font></strong>

测试重点：

- <strong><font color="red">🔴 已完成：入库必须锁定客户开关。</font></strong>
- <strong><font color="red">🔴 已完成：出库客户归属校验开关。</font></strong>
- <strong><font color="red">🔴 已完成：IMEI、UPS 重复检测开关。</font></strong>
- <strong><font color="red">🔴 已完成：数据保留策略参数校验。</font></strong>

验收标准：

- <strong><font color="red">🔴 已完成：系统设置页面所有配置有后端来源。</font></strong>
- <strong><font color="red">🔴 已完成：修改设置能审计，并已提供后续业务校验可读取的稳定 setting key。</font></strong>

## 09 阶段五：客户管理

对应页面：

- 客户管理。
- 入库扫码客户选择。
- 客户库存客户选择。
- 出库装箱客户选择。
- 批量修改客户新旧客户选择。
- 明细下载客户筛选。

后端目录：

- `apps/api/src/modules/customers`

要完成的内容：

- <strong><font color="red">🔴 已完成：客户列表、搜索、分页。</font></strong>
- <strong><font color="red">🔴 已完成：新增客户。</font></strong>
- <strong><font color="red">🔴 已完成：编辑客户。</font></strong>
- <strong><font color="red">🔴 已完成：启用、停用客户。</font></strong>
- <strong><font color="red">🔴 已完成：客户统计：在库 IMEI、SKU 数、本月入库、本月出库。</font></strong>
- <strong><font color="red">🔴 已完成：客户变更写入审计日志。</font></strong>

建议接口标题：

- `GET /customers`
- `GET /customers/options`
- `GET /customers/:id`
- `POST /customers`
- `PATCH /customers/:id`
- `PATCH /customers/:id/status`
- `GET /customers/:id/summary`

文档同步：

- <strong><font color="red">🔴 已完成：`docs/api/06-customers.md`。</font></strong>
- <strong><font color="red">🔴 已完成：`docs/product/03-customer-rules.md`。</font></strong>

测试重点：

- <strong><font color="red">🔴 已完成：停用客户不可用于新入库的下拉选项默认排除规则。</font></strong>
- <strong><font color="red">🔴 已完成：有库存客户不能被物理删除，当前阶段不提供物理删除接口。</font></strong>
- <strong><font color="red">🔴 已完成：客户编号唯一。</font></strong>
- <strong><font color="red">🔴 已完成：客户统计准确的 repository 聚合口径。</font></strong>

验收标准：

- <strong><font color="red">🔴 已完成：客户管理页面可完成基本 CRUD。</font></strong>
- <strong><font color="red">🔴 已完成：其他页面可复用客户下拉数据。</font></strong>

## 10 阶段六：UPC 商品库

对应页面：

- UPC 商品库。
- 入库扫码 UPC 识别。
- 库存、出库、报表中的商品信息展示。

后端目录：

- `apps/api/src/modules/products`

要完成的内容：

- <strong><font color="red">🔴 已完成：UPC 商品列表、搜索、分类筛选、分页。</font></strong>
- <strong><font color="red">🔴 已完成：新增商品。</font></strong>
- <strong><font color="red">🔴 已完成：编辑商品。</font></strong>
- <strong><font color="red">🔴 已完成：启用、停用商品。</font></strong>
- <strong><font color="red">🔴 已完成：批量导入商品。</font></strong>
- <strong><font color="red">🔴 已完成：通过 UPC 查询商品。</font></strong>
- <strong><font color="red">🔴 已完成：商品变更写入审计日志。</font></strong>

建议接口标题：

- `GET /products`
- `GET /products/:id`
- `GET /products/by-upc/:upc`
- `POST /products`
- `PATCH /products/:id`
- `PATCH /products/:id/status`
- `POST /products/import`

文档同步：

- <strong><font color="red">🔴 已完成：`docs/api/07-products-upc-library.md`。</font></strong>
- <strong><font color="red">🔴 已完成：`docs/product/04-upc-product-rules.md`。</font></strong>

测试重点：

- <strong><font color="red">🔴 已完成：UPC 唯一。</font></strong>
- <strong><font color="red">🔴 已完成：停用 UPC 不可用于新入库。</font></strong>
- <strong><font color="red">🔴 已完成：需要 IMEI 的商品必须提供 IMEI 标记已通过 UPC 查询暴露，入库强校验在阶段七实现。</font></strong>
- <strong><font color="red">🔴 已完成：不需要 IMEI 的商品允许使用 Serial 或数量型入库规则的商品标记已入库，入库执行规则在阶段七实现。</font></strong>

验收标准：

- <strong><font color="red">🔴 已完成：UPC 商品库页面可通过后端接口维护商品。</font></strong>
- <strong><font color="red">🔴 已完成：入库扫码可通过 `GET /products/by-upc/:upc` 按 UPC 识别商品。</font></strong>

## 11 阶段七：入库扫码

对应页面：

- 入库扫码。
- 入库记录。
- 异常池。
- Dashboard。

后端目录：

- `apps/api/src/modules/inbound`
- `apps/api/src/modules/inventory`
- `apps/api/src/modules/exceptions`
- `apps/api/src/modules/audit-logs`

要完成的内容：

- <strong><font color="red">🔴 已完成：锁定客户后创建入库草稿。</font></strong>
- <strong><font color="red">🔴 已完成：扫描 UPS。</font></strong>
- <strong><font color="red">🔴 已完成：扫描 UPC 并匹配商品。</font></strong>
- <strong><font color="red">🔴 已完成：扫描 IMEI 或 Serial。</font></strong>
- <strong><font color="red">🔴 已完成：本次入库预览。</font></strong>
- <strong><font color="red">🔴 已完成：移除预览明细。</font></strong>
- <strong><font color="red">🔴 已完成：清空本次草稿。</font></strong>
- <strong><font color="red">🔴 已完成：确认入库。</font></strong>
- <strong><font color="red">🔴 已完成：确认入库时写库存、入库记录、审计日志。</font></strong>
- <strong><font color="red">🔴 已完成：UPC 未匹配、IMEI 重复、UPS 重复等异常写入异常池。</font></strong>

建议接口标题：

- `POST /inbound/drafts`
- `GET /inbound/drafts/:id`
- `POST /inbound/drafts/:id/ups`
- `POST /inbound/drafts/:id/items`
- `DELETE /inbound/drafts/:id/items/:itemId`
- `DELETE /inbound/drafts/:id/items`
- `POST /inbound/drafts/:id/confirm`
- `GET /inbound/records`
- `GET /inbound/records/:id`

核心业务规则：

- 未锁定客户禁止扫描。
- UPS、UPC、IMEI、Serial 必须绑定当前锁定客户。
- UPC 必须匹配商品库；未匹配进入异常池。
- IMEI 是单件库存核心追踪 ID。
- 需要 IMEI 的商品必须校验 IMEI。
- 确认入库必须在数据库事务中完成。

文档同步：

- <strong><font color="red">🔴 已完成：`docs/api/08-inbound-scan.md`。</font></strong>
- <strong><font color="red">🔴 已完成：`docs/product/05-inbound-rules.md`。</font></strong>
- <strong><font color="red">🔴 已完成：`docs/database/05-inbound-inventory-transaction.md`。</font></strong>

测试重点：

- <strong><font color="red">🔴 已完成：未锁定客户不能扫描。</font></strong>
- <strong><font color="red">🔴 已完成：UPC 未匹配生成异常。</font></strong>
- <strong><font color="red">🔴 已完成：IMEI 重复生成异常或阻断。</font></strong>
- <strong><font color="red">🔴 已完成：确认入库事务失败时不能产生半成品库存，事务边界已集中在 repository transaction，待连接空库做数据库级烟测。</font></strong>
- <strong><font color="red">🔴 已完成：入库确认生成 audit log。</font></strong>

验收标准：

- <strong><font color="red">🔴 已完成：入库扫码后端可完成客户锁定、扫码、预览、确认入库。</font></strong>
- <strong><font color="red">🔴 已完成：入库记录页面可通过后端接口查询确认后的明细。</font></strong>

## 12 阶段八：入库记录

对应页面：

- 入库记录。
- 批量修改客户。
- 明细下载。

后端目录：

- `apps/api/src/modules/inbound`

要完成的内容：

- <strong><font color="red">🔴 已完成：按时间、客户、UPS、UPC、IMEI、状态筛选，并补充批次、仓库、Serial、库存状态筛选。</font></strong>
- <strong><font color="red">🔴 已完成：分页和排序。</font></strong>
- <strong><font color="red">🔴 已完成：查看详情。</font></strong>
- <strong><font color="red">🔴 已完成：支持选择记录进入批量改客户，列表行返回 `selectableForCustomerChange`。</font></strong>
- <strong><font color="red">🔴 已完成：支持导出条件复用到报表模块，新增 `export-preview` 返回 reusable report payload。</font></strong>

建议接口标题：

- `GET /inbound/records`
- `GET /inbound/records/:id`
- `GET /inbound/records/:id/items`
- `POST /inbound/records/export-preview`

文档同步：

- <strong><font color="red">🔴 已完成：`docs/api/09-inbound-records.md`。</font></strong>

测试重点：

- <strong><font color="red">🔴 已完成：筛选条件组合正确。</font></strong>
- <strong><font color="red">🔴 已完成：权限门禁继续使用 `inbound.manage`；客户/仓库数据范围模型尚未进入数据库设计，已在阶段八 API 文档标注后续接入点。</font></strong>
- <strong><font color="red">🔴 已完成：已出库、异常、在库状态通过 `inventoryStatus` 从关联库存行返回和筛选。</font></strong>

验收标准：

- <strong><font color="red">🔴 已完成：入库记录页面能完成多条件查询和详情查看。</font></strong>

## 13 阶段九：客户库存

对应页面：

- 客户库存。
- 出库装箱。
- 明细下载。
- Dashboard。

后端目录：

- `apps/api/src/modules/inventory`

要完成的内容：

- <strong><font color="red">🔴 已完成：按客户查询库存汇总。</font></strong>
- <strong><font color="red">🔴 已完成：按商品汇总 SKU、在库数量、已出库数量、异常数量。</font></strong>
- <strong><font color="red">🔴 已完成：展开 IMEI 明细。</font></strong>
- <strong><font color="red">🔴 已完成：搜索 UPC、商品名、IMEI、Serial、UPS。</font></strong>
- <strong><font color="red">🔴 已完成：提供库存导出预览 payload；实际文件生成保留给 reports 模块。</font></strong>
- <strong><font color="red">🔴 已完成：提供出库装箱可用库存查询。</font></strong>

建议接口标题：

- `GET /inventory/customer-summary`
- `GET /inventory/products`
- `GET /inventory/products/:productId/items`
- `GET /inventory/items`
- `GET /inventory/items/:id`

文档同步：

- <strong><font color="red">🔴 已完成：`docs/api/10-inventory.md`。</font></strong>
- <strong><font color="red">🔴 已完成：`docs/product/06-inventory-rules.md`。</font></strong>

测试重点：

- <strong><font color="red">🔴 已完成：库存状态计数准确。</font></strong>
- <strong><font color="red">🔴 已完成：只统计当前客户库存。</font></strong>
- <strong><font color="red">🔴 已完成：异常库存不允许直接出库，可出库列表强制 `IN_STOCK`。</font></strong>
- <strong><font color="red">🔴 已完成：IMEI 明细分页准确。</font></strong>

验收标准：

- <strong><font color="red">🔴 已完成：客户库存页面可按客户查看 SKU 汇总和 IMEI 明细。</font></strong>
- <strong><font color="red">🔴 已完成：出库装箱页面能复用可装箱库存。</font></strong>

## 14 阶段十：出库装箱

对应页面：

- 出库装箱。
- 客户库存。
- Dashboard。
- 明细下载。

后端目录：

- `apps/api/src/modules/outbound`
- `apps/api/src/modules/inventory`
- `apps/api/src/modules/audit-logs`

要完成的内容：

- <strong><font color="red">🔴 已完成：选择客户。</font></strong>
- <strong><font color="red">🔴 已完成：创建箱号。</font></strong>
- <strong><font color="red">🔴 已完成：查询当前客户可装箱库存。</font></strong>
- <strong><font color="red">🔴 已完成：按 UPS、UPC、IMEI、商品名搜索可装箱明细。</font></strong>
- <strong><font color="red">🔴 已完成：加入当前箱。</font></strong>
- <strong><font color="red">🔴 已完成：从当前箱移除。</font></strong>
- <strong><font color="red">🔴 已完成：清空当前箱。</font></strong>
- <strong><font color="red">🔴 已完成：封箱确认。</font></strong>
- <strong><font color="red">🔴 已完成：封箱后库存状态从 `IN_STOCK` 变为 `PACKED`。</font></strong>
- <strong><font color="red">🔴 已完成：出库客户归属校验。</font></strong>

建议接口标题：

- <strong><font color="red">🔴 已完成：`POST /outbound/boxes`。</font></strong>
- <strong><font color="red">🔴 已完成：`GET /outbound/boxes/:id`。</font></strong>
- <strong><font color="red">🔴 已完成：`GET /outbound/available-items`。</font></strong>
- <strong><font color="red">🔴 已完成：`POST /outbound/boxes/:id/items`。</font></strong>
- <strong><font color="red">🔴 已完成：`DELETE /outbound/boxes/:id/items/:itemId`。</font></strong>
- <strong><font color="red">🔴 已完成：`DELETE /outbound/boxes/:id/items`。</font></strong>
- <strong><font color="red">🔴 已完成：`POST /outbound/boxes/:id/seal`。</font></strong>
- <strong><font color="red">🔴 已完成：`GET /outbound/boxes`。</font></strong>

核心业务规则：

- <strong><font color="red">🔴 已完成：出库不能重新分配客户。</font></strong>
- <strong><font color="red">🔴 已完成：只能装当前客户名下库存。</font></strong>
- <strong><font color="red">🔴 已完成：非在库状态不能加入箱。</font></strong>
- <strong><font color="red">🔴 已完成：封箱必须在数据库事务中完成。</font></strong>
- <strong><font color="red">🔴 已完成：封箱必须写 audit log。</font></strong>

文档同步：

- <strong><font color="red">🔴 已完成：`docs/api/11-outbound-packing.md`。</font></strong>
- <strong><font color="red">🔴 已完成：`docs/product/07-outbound-rules.md`。</font></strong>
- <strong><font color="red">🔴 已完成：`docs/database/06-outbound-transaction.md`。</font></strong>

测试重点：

- <strong><font color="red">🔴 已完成：IMEI 不属于当前客户时禁止装箱。</font></strong>
- <strong><font color="red">🔴 已完成：重复加入同一箱要阻断。</font></strong>
- <strong><font color="red">🔴 已完成：已出库或异常库存不能装箱。</font></strong>
- <strong><font color="red">🔴 已完成：封箱事务失败不能改变部分库存状态。</font></strong>

验收标准：

- <strong><font color="red">🔴 已完成：出库装箱页面可创建箱号、加入明细、移除明细、封箱。</font></strong>

## 15 阶段十一：异常池

对应页面：

- 异常池。
- Dashboard。
- 入库扫码。
- 出库装箱。

后端目录：

- `apps/api/src/modules/exceptions`
- `apps/api/src/modules/audit-logs`

要完成的内容：

- 异常列表、类型 tab、分页。
- <strong><font color="red">🔴 已完成：`GET /exceptions` 支持状态、类型、客户、仓库、关键词、分页和排序。</font></strong>
- 异常详情。
- <strong><font color="red">🔴 已完成：`GET /exceptions/:id` 返回异常、客户、仓库、商品、入库行、库存和最新装箱上下文。</font></strong>
- 确认处理。
- <strong><font color="red">🔴 已完成：`POST /exceptions/:id/resolve`。</font></strong>
- 忽略异常。
- <strong><font color="red">🔴 已完成：`POST /exceptions/:id/ignore`。</font></strong>
- 标记无效。
- <strong><font color="red">🔴 已完成：`POST /exceptions/:id/invalidate`。</font></strong>
- 批量处理。
- <strong><font color="red">🔴 已完成：`POST /exceptions/batch-resolve` 逐条返回成功或失败结果。</font></strong>
- 批量忽略。
- <strong><font color="red">🔴 已完成：`POST /exceptions/batch-ignore` 逐条返回成功或失败结果。</font></strong>
- 异常处理写 audit log。
- <strong><font color="red">🔴 已完成：单条和批量处理都会为成功处理的记录写 `EXCEPTION_HANDLE` audit log。</font></strong>

异常类型标题：

- `UPC_NOT_MATCHED`: UPC 未匹配。
- `IMEI_DUPLICATED`: IMEI 重复。
- `UPS_DUPLICATED`: UPS 重复。
- `CUSTOMER_OWNERSHIP_MISMATCH`: 客户归属错误。
- `IMEI_NOT_INBOUNDED`: IMEI 未入库。
- <strong><font color="red">🔴 已完成：Prisma 与 shared 枚举已统一为以上标题。</font></strong>

建议接口标题：

- `GET /exceptions`
- `GET /exceptions/summary`
- `GET /exceptions/:id`
- `POST /exceptions/:id/resolve`
- `POST /exceptions/:id/ignore`
- `POST /exceptions/:id/invalidate`
- `POST /exceptions/batch-resolve`
- `POST /exceptions/batch-ignore`

文档同步：

- `docs/api/12-exceptions.md`
- <strong><font color="red">🔴 已完成：`docs/api/12-exceptions.md`。</font></strong>
- `docs/product/08-exception-rules.md`
- <strong><font color="red">🔴 已完成：`docs/product/08-exception-rules.md`。</font></strong>

测试重点：

- 每类异常来源明确。
- 处理说明必填规则。
- 已处理异常不能重复处理。
- 批量处理保留每条记录结果。

验收标准：

- 异常池页面可查询、查看详情、处理、忽略、标记无效。

## 16 阶段十二：批量修改客户

对应页面：

- 批量修改客户。
- 入库记录。
- 客户库存。
- Dashboard。

后端目录：

- `apps/api/src/modules/customers`
- `apps/api/src/modules/inbound`
- `apps/api/src/modules/inventory`
- `apps/api/src/modules/audit-logs`

建议内部子目录：

```text
apps/api/src/modules/customers/customer-change/
```

要完成的内容：

- <strong><font color="red">🔴 已完成：按时间、当前客户、仓库、UPS、UPC、IMEI、商品名和搜索文本筛选可修改记录。</font></strong>
- <strong><font color="red">🔴 已完成：支持选择入库记录进入批量改客户。</font></strong>
- <strong><font color="red">🔴 已完成：预览修改影响并返回 `previewToken`。</font></strong>
- <strong><font color="red">🔴 已完成：提交新客户和修改原因，提交时校验 preview token 防止记录集变更。</font></strong>
- <strong><font color="red">🔴 已完成：同步更新入库明细、库存明细和关联异常记录客户归属。</font></strong>
- <strong><font color="red">🔴 已完成：生成 `CustomerChangeLog`。</font></strong>
- <strong><font color="red">🔴 已完成：生成 `CUSTOMER_BATCH_CHANGE` audit log。</font></strong>

建议接口标题：

- `GET /customer-changes/candidates`
- `POST /customer-changes/preview`
- `POST /customer-changes/commit`
- `GET /customer-changes/logs`

核心业务规则：

- 必须先 preview，再 commit。
- 修改原因必填。
- 已出库记录原则上禁止修改客户，除非后续产品规则明确允许。
- 批量修改必须记录 before、after、operator、timestamp、reason、affected records。
- 批量修改必须在事务中完成。

文档同步：

- <strong><font color="red">🔴 已完成：`docs/api/13-batch-customer-change.md`。</font></strong>
- <strong><font color="red">🔴 已完成：`docs/product/09-batch-customer-change-rules.md`。</font></strong>

测试重点：

- preview 和 commit 记录集一致性。
- 修改原因必填。
- 已出库记录阻断。
- 所有关联表客户归属一致更新。
- 日志完整。

验收标准：

- <strong><font color="red">🔴 已完成：批量修改客户页面可筛选、预览、提交并查看修改日志。</font></strong>

## 17 阶段十三：明细下载与报表导出

对应页面：

- 明细下载。
- 入库记录导出。
- 客户库存导出。
- Dashboard 导出。

后端目录：

- `apps/api/src/modules/reports`
- `apps/api/src/jobs`

要完成的内容：

- <strong><font color="red">🔴 已完成：报表类型选择。</font></strong>
- <strong><font color="red">🔴 已完成：日期、客户、商品筛选。</font></strong>
- <strong><font color="red">🔴 已完成：字段选择和字段白名单校验。</font></strong>
- <strong><font color="red">🔴 已完成：CSV 导出。</font></strong>
- <strong><font color="red">🔴 已完成：Excel XML 导出。</font></strong>
- <strong><font color="red">🔴 已完成：导出预览统计。</font></strong>
- <strong><font color="red">🔴 已完成：下载历史。</font></strong>
- <strong><font color="red">🔴 已完成：基于历史导出的重新下载。</font></strong>
- <strong><font color="red">🔴 已完成：导出操作写 audit log。</font></strong>

建议接口标题：

- `POST /reports/preview`
- `POST /reports/exports`
- `GET /reports/exports`
- `GET /reports/exports/:id`
- `GET /reports/exports/:id/download`

报表类型标题：

- `INBOUND_DETAIL`: 入库明细。
- `OUTBOUND_DETAIL`: 出库明细。
- `INVENTORY_DETAIL`: 库存明细。
- `EXCEPTION_DETAIL`: 异常明细。
- `CUSTOMER_CHANGE_LOG`: 客户修改日志。
- `AUDIT_LOG`: 操作日志。

文档同步：

- <strong><font color="red">🔴 已完成：`docs/api/14-reports.md`。</font></strong>
- <strong><font color="red">🔴 已完成：`docs/product/10-report-rules.md`。</font></strong>

测试重点：

- <strong><font color="red">🔴 已完成：字段白名单，不能导出未授权字段。</font></strong>
- <strong><font color="red">🔴 已完成：大报表同步导出阻断并提示后台任务。</font></strong>
- <strong><font color="red">🔴 已完成：下载链接权限校验。</font></strong>
- <strong><font color="red">🔴 已完成：导出历史状态准确。</font></strong>

验收标准：

- 明细下载页面可预览统计、创建导出任务、查看历史、重新下载。

## 18 阶段十四：Dashboard 和审计日志

对应页面：

- Dashboard。
- 所有关键操作。

后端目录：

- `apps/api/src/modules/audit-logs`
- `apps/api/src/modules/reports`
- 各业务模块 service 内写审计。

要完成的内容：

- <strong><font color="red">🔴 已完成：今日入库数，按已确认入库明细和当天 `scannedAt` 统计。</font></strong>
- <strong><font color="red">🔴 已完成：今日出库装箱数，按已封箱出库箱和当天 `sealedAt` 统计。</font></strong>
- <strong><font color="red">🔴 已完成：在库总量，按 `InventoryItem.status = IN_STOCK` 统计。</font></strong>
- <strong><font color="red">🔴 已完成：待处理异常数，按 `ExceptionRecord.status = OPEN` 统计。</font></strong>
- <strong><font color="red">🔴 已完成：近 7 日入库/出库趋势，返回今天和前 6 天的每日入库明细数、出库封箱数。</font></strong>
- <strong><font color="red">🔴 已完成：异常分布，按待处理异常类型分组统计。</font></strong>
- <strong><font color="red">🔴 已完成：今日入库 TOP 客户，返回当天已确认入库明细数最高的前 5 个客户。</font></strong>
- <strong><font color="red">🔴 已完成：最近操作日志，返回最新 10 条审计日志。</font></strong>
- <strong><font color="red">🔴 已完成：审计日志查询接口，支持分页、搜索、操作类型、资源、操作人、请求 ID 和时间范围筛选。</font></strong>

建议接口标题：

- <strong><font color="red">🔴 已完成：`GET /dashboard/summary`。</font></strong>
- <strong><font color="red">🔴 已完成：`GET /dashboard/trends`。</font></strong>
- <strong><font color="red">🔴 已完成：`GET /dashboard/exception-distribution`。</font></strong>
- <strong><font color="red">🔴 已完成：`GET /dashboard/top-inbound-customers`。</font></strong>
- <strong><font color="red">🔴 已完成：`GET /audit-logs/recent`。</font></strong>
- <strong><font color="red">🔴 已完成：`GET /audit-logs`。</font></strong>

实现位置建议：

```text
apps/api/src/modules/reports/dashboard/
```

- <strong><font color="red">🔴 已完成：Dashboard 后端已实现于 `apps/api/src/modules/reports/dashboard/`，包含 controller、service、repository、DTO 和测试。</font></strong>
- <strong><font color="red">🔴 已完成：审计日志查询已实现于 `apps/api/src/modules/audit-logs/`，包含 controller、DTO、service 查询逻辑和测试。</font></strong>
- <strong><font color="red">🔴 已完成：`audit-logs.read` 已加入开发种子权限，Dashboard 继续使用 `dashboard.read`。</font></strong>

文档同步：

- <strong><font color="red">🔴 已完成：`docs/api/15-dashboard-audit-logs.md`。</font></strong>
- <strong><font color="red">🔴 已完成：`docs/product/11-dashboard-rules.md`。</font></strong>
- <strong><font color="red">🔴 已完成：`docs/api/README.md` 已登记阶段十四 API 文档。</font></strong>
- <strong><font color="red">🔴 已完成：`docs/changelog/2026-06-18.md` 已记录阶段十四交付内容、修改位置、模块用途和使用逻辑。</font></strong>

测试重点：

- <strong><font color="red">🔴 已完成：新增 Dashboard service 单元测试，覆盖统计口径、7 日趋势补零、异常分布和 TOP 客户。</font></strong>
- <strong><font color="red">🔴 已完成：新增 AuditLogs service 单元测试，覆盖 actor、action、target、before、after、requestId、createdAt 等响应字段。</font></strong>
- <strong><font color="red">🔴 已完成：审计日志接口已通过 `audit-logs.read` 权限保护，Dashboard 接口已通过 `dashboard.read` 权限保护。</font></strong>

验收标准：

- <strong><font color="red">🔴 已完成：Dashboard 所有指标来自真实 Prisma 查询并通过真实 API controller 暴露。</font></strong>
- <strong><font color="red">🔴 已完成：最近操作日志从 `AuditLog` 表读取，返回 operator、resource、snapshot、metadata 和 requestId，可追溯到具体业务操作。</font></strong>
- <strong><font color="red">🔴 已完成：已通过 `tsc --noEmit`、ESLint、API 全量 Jest 测试和 Prisma schema validate。</font></strong>

## 19 阶段十五：API 联调与前端接入顺序

推荐联调顺序：

- <strong><font color="red">🔴 已完成：`GET /health` 和统一错误格式已纳入前端 `request<T>()` 基础联调入口。</font></strong>
- <strong><font color="red">🔴 已完成：登录、当前用户、权限已封装在 `apps/web/src/api/auth.ts`，token 由 `token-store.ts` 管理。</font></strong>
- <strong><font color="red">🔴 已完成：客户 options 已登记在 `apiIntegrationSteps` 和 `customersApi.options`。</font></strong>
- <strong><font color="red">🔴 已完成：UPC 查询已按真实后端路径 `GET /products/by-upc/:upc` 登记。</font></strong>
- <strong><font color="red">🔴 已完成：客户管理 CRUD 已登记在 `customersApi`。</font></strong>
- <strong><font color="red">🔴 已完成：UPC 商品库 CRUD 已登记在 `productsApi`。</font></strong>
- <strong><font color="red">🔴 已完成：入库扫码草稿、UPS 扫描、明细追加和确认已登记在 `inboundApi`。</font></strong>
- <strong><font color="red">🔴 已完成：入库记录查询已登记在 `inboundApi.records`。</font></strong>
- <strong><font color="red">🔴 已完成：客户库存查询已登记在 `inventoryApi`。</font></strong>
- <strong><font color="red">🔴 已完成：出库装箱查询、建箱、加项和封箱已登记在 `outboundApi`。</font></strong>
- <strong><font color="red">🔴 已完成：异常池列表、汇总、处理和批量处理已登记在 `exceptionsApi`。</font></strong>
- <strong><font color="red">🔴 已完成：批量修改客户已按真实后端路径 `/customer-changes` 登记在 `customerChangesApi`。</font></strong>
- <strong><font color="red">🔴 已完成：明细下载的预览、导出和历史查询已登记在 `reportsApi`。</font></strong>
- <strong><font color="red">🔴 已完成：Dashboard 和审计日志已登记在 `dashboardApi` 与 `auditLogsApi`。</font></strong>
- <strong><font color="red">🔴 已完成：系统设置页面已接入 `GET /warehouses`、`GET /settings`、`PATCH /settings`，支持全部分组保存。</font></strong>

每个页面接入时必须同步：

- 后端 controller、service、repository、dto、tests。
- `docs/api/<topic>.md`。
- 必要时更新 `docs/product/<topic>.md`。
- 必要时更新 `docs/database/<topic>.md`。
- `docs/changelog/YYYY-MM-DD.md`。

实现位置：

- <strong><font color="red">🔴 已完成：`apps/web/src/api/client.ts` 提供统一 API envelope 解包和错误对象。</font></strong>
- <strong><font color="red">🔴 已完成：`apps/web/src/api/integration-plan.ts` 提供可复用的前端联调顺序清单。</font></strong>
- <strong><font color="red">🔴 已完成：`apps/web/src/api/workflow.ts` 提供各业务页面后续接入的轻量 API facade。</font></strong>
- <strong><font color="red">🔴 已完成：`apps/web/src/pages/system-settings/page.tsx` 已从占位页升级为真实系统设置读写页面。</font></strong>

文档同步：

- <strong><font color="red">🔴 已完成：`docs/api/16-frontend-api-integration.md`。</font></strong>
- <strong><font color="red">🔴 已完成：`docs/api/README.md` 已登记阶段十五联调文档。</font></strong>
- <strong><font color="red">🔴 已完成：`docs/changelog/2026-06-18.md` 已记录阶段十五交付内容、修改位置、模块用途和使用逻辑。</font></strong>

验收标准：

- <strong><font color="red">🔴 已完成：前端 API client 会自动附带 Bearer token，并对统一响应 envelope 解包。</font></strong>
- <strong><font color="red">🔴 已完成：系统设置页可读取活跃仓库和分组设置，并通过 `PATCH /settings` 保存全部设置分组。</font></strong>
- <strong><font color="red">🔴 已完成：已通过 Web TypeScript、ESLint 和构建校验。</font></strong>

## 20 阶段十六：测试体系

测试目录标题：

```text
apps/api/src/modules/<module>/tests/
```

测试分层：

- 单元测试：service 业务规则。
- repository 测试：复杂查询和事务边界。
- controller 测试：鉴权、DTO、响应格式。
- e2e 测试：入库、出库、批量改客户等核心流程。

必须覆盖的业务标题：

- 扫码校验。
- 入库客户锁定。
- UPC 匹配。
- IMEI 唯一性。
- 库存状态流转。
- 出库客户归属校验。
- 封箱事务。
- 异常处理。
- 批量客户修改。
- 权限检查。
- 审计日志。

## 21 阶段十七：部署服务器上线

基础设施目录：

```text
infra/
  docker/
  deploy/
  nginx/
  scripts/
```

上线前要完成：

- 生产环境 `.env` 模板，不提交真实 `.env`。
- PostgreSQL 生产数据库。
- Redis 生产实例。
- Prisma migration 发布流程。
- API Dockerfile。
- Web Dockerfile 或静态产物部署。
- Nginx 反向代理。
- HTTPS 证书。
- 日志目录和日志轮转。
- 数据库备份策略。
- 健康检查。
- 回滚方案。

建议部署标题：

- `01 服务器基础环境`
- `02 域名和 HTTPS`
- `03 PostgreSQL 和 Redis`
- `04 API 构建和启动`
- `05 Web 构建和发布`
- `06 Nginx 反向代理`
- `07 Prisma Migration`
- `08 Seed 最小生产数据`
- `09 健康检查和烟雾测试`
- `10 备份和回滚`

上线验收：

- `GET /api/v1/health` 正常。
- Swagger 在受控环境可访问或生产关闭。
- 前端可登录。
- 客户、UPC、入库、库存、出库、异常、导出核心流程可跑通。
- 审计日志有记录。
- 生产日志不打印密码、token、API key。

## 22 后续维护定位表

| 要修改的功能          | 优先修改位置                                         |
| --------------------- | ---------------------------------------------------- |
| 登录、当前用户、token | `apps/api/src/modules/auth`                          |
| 用户、角色、权限      | `apps/api/src/modules/users`, `roles`, `permissions` |
| 仓库信息              | `apps/api/src/modules/warehouses`                    |
| 系统设置、扫码规则    | `apps/api/src/modules/settings`                      |
| 客户管理              | `apps/api/src/modules/customers`                     |
| UPC 商品库            | `apps/api/src/modules/products`                      |
| 入库扫码              | `apps/api/src/modules/inbound`                       |
| 入库记录              | `apps/api/src/modules/inbound`                       |
| 客户库存              | `apps/api/src/modules/inventory`                     |
| 出库装箱              | `apps/api/src/modules/outbound`                      |
| 异常池                | `apps/api/src/modules/exceptions`                    |
| 批量修改客户          | `apps/api/src/modules/customers/customer-change`     |
| 明细下载              | `apps/api/src/modules/reports`                       |
| Dashboard             | `apps/api/src/modules/reports/dashboard`             |
| 审计日志              | `apps/api/src/modules/audit-logs`                    |
| 数据库模型            | `apps/api/prisma/schema.prisma`, `docs/database`     |
| API 合同              | `docs/api`                                           |
| 产品规则              | `docs/product`                                       |
| 部署                  | `infra`                                              |

## 23 推荐第一批开发标题

第一批不要直接做入库扫码。推荐先完成以下小任务：

1. `01 后端基础工程加固`
2. `02 数据库核心模型设计`
3. `03 客户管理 API`
4. `04 UPC 商品库 API`
5. `05 入库扫码草稿 API`

原因：

- 入库扫码依赖客户和 UPC。
- 库存、出库、异常、报表都依赖入库数据。
- 先做客户和 UPC，后续页面联调最稳。
