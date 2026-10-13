# 本地开发与源码导航

聚账是带后端和数据库的 PWA，生产部署依赖 Sites 私有访问及 Cloudflare Workers / D1。GitHub 副本不保存运行数据库、凭据或调度状态。

## 安装

需要 Node.js `>=22.13.0` 和 npm。从仓库根目录运行：

```sh
npm run install:ci
```

安装脚本以锁文件执行 `npm ci`，保留 Vinext / Sites 集成和可选依赖。干净克隆默认使用 `portable` 执行配置，`.sites-runtime/` 本机状态忽略提交。

## 首次本地迁移

模型在 `db/schema.ts`；`0000` 创建账单、配置、元数据、投递表及索引，`0001` 增加投递 `claim_token`。两份 SQL 在 `drizzle/`。

仓库提供 [本地 D1 配置](config/d1-local.json)，数据库占位 ID 与 `vite.config.ts` 一致，仅用于本地，不含生产数据库 ID。

```sh
npx wrangler d1 migrations list DB --local --config docs/config/d1-local.json --persist-to .wrangler/state
npx wrangler d1 migrations apply DB --local --config docs/config/d1-local.json --persist-to .wrangler/state
npm run dev
```

配置中的迁移目录相对配置文件指向 `drizzle/`，迁移记录表用于避免重放。根目录的 `.wrangler/state` 与开发服务器共享。默认开发地址为 `http://127.0.0.1:5173/`。本地模板和路径根据现有 Vite / Wrangler 配置核对；完整的安装、迁移和启动尚未在全新机器重跑。

已有库若曾直接执行 SQL 而无 Wrangler 迁移记录，应先检查表结构和记录，不能盲目重放 `CREATE TABLE` / `ALTER TABLE`。可在独立干净副本验证新建库流程，保留原数据。

`npm run db:generate` 只生成 SQL 和 Drizzle 元数据，不应用迁移。修改模型后审查 SQL、验证迁移，再通过 Sites 发布流程应用生产迁移；不得在 API 请求内建表，也不要用本地占位配置执行远程迁移。

## 鉴权与服务端配置

本地预览有仅供回环地址的模拟登录，不能证明生产鉴权正常。首次本地登录会初始化本地所有者，不影响生产。

| 变量名 | 用途 |
| --- | --- |
| `SITES_SERVICE_ACCESS_TOKEN` | 既有私有 Sites 服务访问凭据 |
| `CONFIG_ENCRYPTION_SECRET` | 推送凭据加密及接入密钥派生 |
| `OWNER_PRIVATE_SERVICE_ACCESS=true` | 允许经过私有 Sites 外层边界的服务调用受限入口 |

实际值仅通过授权服务管理，本地使用独立测试凭据，不导出生产秘密。移植其他平台前须替换外层鉴权边界，不能在公开站点直接启用 `OWNER_PRIVATE_SERVICE_ACCESS`。

AES-GCM 加密保护推送凭据，不是所有账单字段的端到端加密。交易正文、金额、商户保存在 D1，由私有访问与所有者限制保护。替换秘密会影响旧凭据解密及手机接入，需设计轮换迁移。

## 验证

```sh
npx tsc --noEmit
node --experimental-strip-types tests/ledger-domain.test.ts
node --experimental-strip-types tests/push-adapters.test.ts
npm run build
```

两个 Node 测试不发真实微信消息。本次 GitHub 副本再次运行这两个测试通过。领域测试涵盖金额、通知状态、CSV、幂等、多次退款和日报；推送测试用模拟 `fetch` 检查业务状态、重试、地址限制及分段。

启动本地开发服务器并完成迁移后，可另开终端：

```sh
python3 tests/http-smoke.py http://127.0.0.1:5173
```

脚本只接受本地 HTTP 回环地址，创建随机标记合成账单，验证持久化、CRUD、导入 / 导出、去重、日报及删除 / 撤销，最后软删除自己创建的账单。它不验证手机触发和真实微信接收；不要改为直接针对生产运行。

`npm run start` 在构建后使用生成的 `dist/server/wrangler.json` 启动本地 Worker。生产发布还需 Sites 的打包 / 发布流程、平台登录、D1 绑定与秘密配置。

`npm run lint` 是模板已有 ESLint 脚本。当前完成记录为类型检查、领域 / 推送测试、构建、本地 HTTP 及布局检查，未将 ESLint、真实设备端到端、全面安全审计或压力测试列为已经通过。

## 源码导航

| 路径 | 职责 |
| --- | --- |
| `app/page.tsx`、`app/layout.tsx` | 页面入口、布局、PWA 元信息 |
| `app/ledger-client.tsx` | 四页 UI、表单、导入 / 导出、删除 / 撤销、接入与推送设置 |
| `app/globals.css` | 白灰界面、响应式布局、弹窗、焦点与减少动效 |
| `app/chatgpt-auth.ts` | Sites 身份与登录跳转 |
| `app/api/[...path]/route.ts` | 账本、接入、导入 / 导出、设置与日报 API |
| `lib/ledger-domain.ts` | 金额、通知、CSV、分类、去重、北京时间与完整日报 |
| `lib/ledger-store.ts` | D1 持久化、所有者校验、推送凭据加密 |
| `lib/push-adapters.ts` | SCT / SC3、PushPlus、企业微信、重试与分段 |
| `db/schema.ts`、`drizzle/` | 模型、SQL 迁移与元数据 |
| `tests/` | 领域、推送模拟、本地 HTTP 检查 |
| `public/manifest.webmanifest`、`public/sw.js`、图标 | PWA 信息，仅缓存公开图标 |
| `build/`、`scripts/`、`vite.config.ts` | Sites / Vinext 构建、安装与预览 |
| `.openai/hosting.json` | 现有项目与绑定标识，不是秘密 |
| `SCHEDULE.md` | 既有每日任务约定，GitHub 不负责执行 |
| `PRODUCT.md`、`DESIGN.md`、`.impeccable/design.json` | 产品与设计记录 |
| `docs/` | 当前状态、完整交接、自动化、开发、同步说明与演示图 |
| `THIRD_PARTY_LICENSES/`、`vendor/` | 改编来源与附带许可 |

## 接口导航

接口需要适当身份或私有服务访问。服务访问仅限 `ingest`、`run-daily`、`report`、`health`；其他入口需要网页用户身份。生产服务入口仍依赖 Sites 外层私有边界。

| 方法与路径 | 用途 |
| --- | --- |
| `GET /api/state` | 账单与不含明文凭据的设置 |
| `GET /api/integration` | 本人获取手机接入地址、请求头、样例 |
| `POST /api/ingest` | 识别和保存交易文本，服务调用检查接入密钥 |
| `POST /api/transactions` | 手动添加 |
| `PATCH /api/transactions` | 编辑、确认、恢复软删除 |
| `DELETE /api/transactions?id=...` | 软删除 |
| `POST /api/import`、`GET /api/export` | CSV 补录与导出 |
| `GET /api/report?date=YYYY-MM-DD` | 指定日期逐笔清单 |
| `PATCH /api/settings` | 推送设置、预算和加密凭据 |
| `POST /api/push` | 本人手动发送清单 |
| `POST /api/run-daily` | 昨日清单，检查开关、时间与投递状态 |
| `GET /api/health` | 健康检查与北京时间日期 |

## 备份与来源

仓库不是生产 D1 数据备份。CSV 适合核对及补录，不等于完整数据库、投递状态或加密设置备份。发布需保留原私有网站、项目、D1 和每日任务；秘密仅通过授权服务管理。

改编来源为 [zyz674/moneybook](https://github.com/zyz674/moneybook)，提交 `f8023c9931818222a495dce834aaa24ac9d9b089`，MIT 原文见 [moneybook-MIT.txt](../THIRD_PARTY_LICENSES/moneybook-MIT.txt)。保留模块版权、模板和依赖许可证；来源说明不会自动给所有第三方代码重新许可。
