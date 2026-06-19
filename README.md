# WMS Scan

美国仓库 Apple 产品扫码入库、库存管理、出库装箱、异常处理、客户库存、批量客户变更、明细导出和审计追踪系统。

本仓库是企业级前后端分离 monorepo：

- `apps/web`: React + Vite + TypeScript 前端。
- `apps/api`: NestJS + Prisma + PostgreSQL 后端。
- `packages/shared`: 前后端共享类型、枚举和扫码校验规则。
- `docs`: 产品、架构、数据库、API、变更记录和运维文档。
- `infra`: 基础设施说明。
- `docs/ui-prototype/original-html`: 原始静态高保真原型，作为产品和 UI 参考保留。

## 功能范围

当前主流程已可本地跑通：

- 登录、用户、角色、权限和审计日志。
- 仓库和系统设置。
- 客户管理。
- UPC 商品库，含 CSV 模板下载和批量导入。
- 入库扫码草稿、UPS/USPS/FedEx 物流单号、UPC/IMEI 明细追加和确认入库。
- 入库记录查询。
- 客户库存、SKU 汇总和 IMEI 明细。
- 出库装箱、批量装箱、封箱和箱内明细查看。
- 异常池处理。
- 批量修改客户。
- 明细下载和报表导出。
- Dashboard 指标。

## 本地快速启动

要求：

- Node.js `>=22`
- pnpm `>=9`
- Docker Desktop 或本机 PostgreSQL 16 / Redis

```bash
git clone https://github.com/lile011022-web/wms-apple.git
cd wms-apple

cp .env.example .env
# 编辑 .env，至少设置 JWT_ACCESS_SECRET、JWT_REFRESH_SECRET、SEED_ADMIN_PASSWORD

docker compose up -d postgres redis
pnpm install

pnpm --filter @wms-scan/api prisma:generate
pnpm --filter @wms-scan/api prisma:migrate
SEED_ADMIN_PASSWORD=<your-local-admin-password> pnpm --filter @wms-scan/api prisma:seed

pnpm dev
```

默认访问地址：

- Web: `http://localhost:5173`
- API: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/api/docs`

种子管理员账号：

- Email: `admin@wms-scan.local`
- Password: 使用你执行 seed 时设置的 `SEED_ADMIN_PASSWORD`

更详细的本地启动、排错和常用命令见 [docs/operations/local-development.md](docs/operations/local-development.md)。

## 常用命令

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
```

单独运行：

```bash
pnpm --filter @wms-scan/api dev
pnpm --filter @wms-scan/web dev
pnpm --filter @wms-scan/shared test
```

## 当前测试服务器

- SSH: `ssh -i ~/.ssh/wms_scan_do -o IdentitiesOnly=yes root@24.199.87.181`
- Server path: `/opt/wms-scan`
- Web: `http://24.199.87.181/`
- Health: `http://24.199.87.181/api/v1/health`

本地修改、验证、提交后，可将当前 checkout 同步到服务器，再在服务器执行：

```bash
PROJECT_DIR=/opt/wms-scan infra/scripts/backup-postgres.sh
PROJECT_DIR=/opt/wms-scan infra/scripts/deploy.sh
```

同步服务器时必须保留 `.env.production`、`backups/` 和 Docker volumes，不要覆盖真实生产配置或数据库备份。

## 文档入口

- 产品规则: [docs/product](docs/product)
- 架构规则和开发路线: [docs/architecture](docs/architecture)
- 数据库设计: [docs/database](docs/database)
- API 合同: [docs/api](docs/api)
- 本地开发和运维: [docs/operations](docs/operations)
- 变更记录: [docs/changelog](docs/changelog)
- 原始 UI 原型: [docs/ui-prototype/original-html](docs/ui-prototype/original-html)

## 分支策略

企业级分支约定：

- `main`: 稳定可拉取使用的主分支。
- `develop`: 日常集成分支。
- `codex/*`: Codex 自动化开发分支。
- `feature/*`: 人工功能分支。
- `fix/*`: 缺陷修复分支。
- `release/*`: 发布候选分支。

详细规则见 [docs/architecture/git-branching.md](docs/architecture/git-branching.md)。

## 安全约束

- 不提交 `.env`、`node_modules`、真实客户数据、真实密码、API Key 或生产凭据。
- `.env.example` 只保留本地开发示例和占位值。
- 生产部署必须显式设置数据库、Redis、JWT secret、CORS origin 和管理员密码。
- 原始 HTML 原型不可删除，除非有明确产品决策。

## 维护定位

- 前端页面和交互：`apps/web/src/pages`、`apps/web/src/features`
- 前端通用组件：`apps/web/src/components`
- 后端业务接口：`apps/api/src/modules/<module-name>`
- 后端通用能力：`apps/api/src/common`
- 后端配置：`apps/api/src/config`
- 数据库访问：`apps/api/src/database`、`apps/api/prisma`
- 共享枚举、类型、扫码校验：`packages/shared/src`
- 产品规则：`docs/product`
- 架构和开发规则：`docs/architecture`
- API 合同：`docs/api`
- 每次交付说明：`docs/changelog/YYYY-MM-DD.md`
