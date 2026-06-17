# WMS Scan

美国仓库 Apple 产品扫码入库、库存管理、出库装箱与异常处理系统。

本仓库当前处于企业级前后端分离 monorepo 后端基础开发阶段。已有静态 UI 原型已保留在：

```text
docs/ui-prototype/original-html/
```

## 项目定位

WMS Scan 用于美国仓库 Apple 产品的扫码作业管理，重点解决：

- 入库前锁定客户，确保 UPS、UPC、IMEI、Serial 归属清晰。
- 通过 UPC 匹配商品库。
- 通过 IMEI 追踪单件库存状态。
- 按客户库存进行出库装箱，禁止出库时重新分配客户。
- 记录批量客户修改日志和关键操作审计。

## 目录结构

```text
apps/
  web/                  # React + Vite + TypeScript 前端应用
  api/                  # NestJS + TypeScript 后端 API
packages/
  shared/               # 前后端共享类型、枚举、扫码校验规则
docs/
  product/              # 产品规则和业务说明
  architecture/         # 架构设计文档
  database/             # 数据库设计文档
  api/                  # API 设计文档
  ui-prototype/
    original-html/      # 原始静态 HTML 高保真原型
  changelog/            # 重要变更记录
infra/
  docker/               # Docker 相关配置
scripts/                # 项目脚本
.github/
  workflows/            # CI/CD 工作流
```

## 当前静态原型位置

原始 11 个 HTML 页面已移动到：

```text
docs/ui-prototype/original-html/
```

这些页面是业务和视觉参考，不要删除，也不要在第一阶段直接重写。

## 后续开发顺序

建议按以下顺序推进：

1. 已完成 monorepo 基础工程配置。
2. 已完成 `packages/shared` 的类型、枚举和扫码校验规则。
3. 已完成 `apps/api` 的 NestJS 基础框架、数据库核心模型、认证、用户、角色、权限、仓库、系统设置、客户管理、UPC 商品库、入库扫码、入库记录和客户库存模块。
4. 下一步继续实现出库装箱、异常池、报表导出和 Dashboard 后端流程。
5. 再接入 `apps/web` 的 React 页面与真实后端 API。
6. 最后补齐异常池、批量修改客户、报表导出和 Dashboard。

## Git 分支建议

- `main`：稳定主分支。
- `develop`：日常集成分支。
- `codex/*`：Codex 自动化开发分支。
- `feature/*`：人工开发功能分支。
- `fix/*`：缺陷修复分支。

每个功能建议小步提交，避免一次性改动多个业务模块。

## 维护定位规则

以后修改功能时，优先按以下位置定位：

- 前端页面和交互：`apps/web/src/pages`、`apps/web/src/features`
- 前端通用组件：`apps/web/src/components`
- 后端业务接口：`apps/api/src/modules/<module-name>`
- 后端通用能力：`apps/api/src/common`
- 后端配置：`apps/api/src/config`
- 数据库访问：`apps/api/src/database`、`apps/api/prisma`
- 前后端共享枚举、类型、扫码校验：`packages/shared/src`
- 产品规则：`docs/product`
- 架构和开发规则：`docs/architecture`
- 每次交付说明：`docs/changelog/YYYY-MM-DD.md`

同一天多次修改时，更新并覆盖当天 changelog 文件，不要新增多个同日文件。
