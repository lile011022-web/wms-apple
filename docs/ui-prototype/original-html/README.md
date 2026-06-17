# WMS Scan — 美国仓库扫码管理系统 UI 原型

高保真 Web 后台管理系统 UI 原型，适用于美国仓库 Apple 产品（iPhone、iPad、MacBook、AirPods 等）的扫码入库/出库管理场景。

## 快速预览

```bash
cd 前端页面
python3 -m http.server 8080
```

浏览器打开 [http://localhost:8080/nav.html](http://localhost:8080/nav.html) 查看全部 11 个页面导航。

## 页面清单

| # | 页面 | 文件 | 说明 |
|---|------|------|------|
| 1 | Dashboard | `index.html` | 运营概览、趋势图、异常分布、操作日志 |
| 2 | 入库扫码 ★ | `inbound-scan.html` | 客户锁定 → UPS/UPC/IMEI 扫描 → 预览 → 确认 |
| 3 | 入库记录 | `inbound-records.html` | 历史查询、筛选、导出 |
| 4 | 客户库存 ★ | `customer-inventory.html` | SKU 汇总、IMEI 展开明细 |
| 5 | 出库装箱 ★ | `outbound-packing.html` | 箱号管理、IMEI 校验、客户归属拦截 |
| 6 | 异常池 ★ | `exception-pool.html` | 5 类异常 + 右侧详情面板 |
| 7 | 批量修改客户 ★ | `batch-customer-change.html` | 筛选、影响范围、修改日志 |
| 8 | 明细下载 | `detail-download.html` | 报表导出、字段选择 |
| 9 | UPC 商品库 | `upc-library.html` | Apple 产品 UPC 映射 |
| 10 | 客户管理 | `customer-management.html` | 客户 CRUD |
| 11 | 系统设置 | `system-settings.html` | 仓库、规则、权限 |

## 设计规范

- **风格**: 现代简约，参考 Linear / Notion / Stripe Dashboard
- **布局**: 1440px 桌面宽度，左侧深色侧边栏 + 浅灰主内容区
- **主色**: Blue `#2563EB` · 成功 Green `#10B981` · 待处理 Orange `#F97316` · 异常 Red `#EF4444`
- **字体**: Inter · 数字 tabular-nums 突出
- **组件**: 白色圆角卡片、清晰表格、批量操作、状态 Badge

## 目录结构

```
前端页面/
├── nav.html              # 原型导航入口
├── index.html            # Dashboard
├── inbound-scan.html     # 入库扫码
├── inbound-records.html  # 入库记录
├── customer-inventory.html
├── outbound-packing.html
├── exception-pool.html
├── batch-customer-change.html
├── detail-download.html
├── upc-library.html
├── customer-management.html
├── system-settings.html
├── css/
│   └── design-system.css # 设计系统
└── js/
    └── layout.js         # 共享侧边栏
```

## 核心业务逻辑（原型体现）

1. **入库**: 必须先选择并锁定客户，所有扫描数据自动绑定
2. **出库**: 不再判断客户归属来源，但 IMEI 必须属于当前选定客户
3. **异常**: UPC 未匹配、IMEI/UPS 重复、客户归属错误、IMEI 未入库
4. **批量修改**: 支持多维度筛选 + 影响范围预览 + 修改日志
