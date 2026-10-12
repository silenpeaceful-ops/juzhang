# 聚账

将微信零钱、支付宝与银行卡的消费汇总到一本私人账本，支持 iPhone 网页应用、支付通知/短信文本入账、CSV 账单补录和每日微信清单。

## 已实现的范围

- 输入明确的消费通知后自动解析金额、商户、渠道和类别并入账；余额提醒、失败交易、验证码与推广信息不会当成消费。
- 收入、退款、账户转移分别记录；充值、提现、信用卡还款不增加消费合计。
- 订单号与固定事件标识用于幂等；不同渠道近时同额的疑似重复记录保留在“待核对”，不计入确认合计，不静默删除。
- 微信、支付宝及银行卡 CSV 导入；可导出全部账单，手动修改、确认和软删除记录。
- 日报含完整逐笔明细、渠道与分类汇总，自动日报采用北京时间的上一完整自然日。
- Server酱 Turbo（SCT）、PushPlus 与企业微信接收渠道。推送结果表示服务已受理，不保证微信客户端已展示；SC3 使用独立 App。

## iPhone 使用

在 Safari 打开已部署的网站，完成本人登录，然后选择分享 → 添加到主屏幕。

在软件“接入”页读取专属地址和请求头。为微信、支付宝和银行 App 分别创建“通知”自动化，筛选明确的消费通知。将通知正文作为 JSON 的 `text`，设置对应 `channel`，并传递事件发生时间 `occurredAt`。相同事件重试时保持 `eventId` 不变。

银行卡短信可使用“信息”自动化；银行邮件可使用“电子邮件”自动化，将交易正文传给同一接口。该软件不登录支付平台、银行账户或邮箱，不会自行抓取未转发的数据。通知没有金额、正文不可用或没有触发时，需要通过官方 CSV 账单补录。

在“每日清单”中输入本人接收渠道密钥，先发送一次测试清单，然后开启每日推送。密钥仅保存在服务器，并通过 AES-GCM 加密；不会写入源代码或返回已保存的明文密钥。不要把密钥放在地址参数或公开分享快捷指令。

## 开发与验证

需要 Node.js >=22.13，npm，以及 Sites 插件。保留模板的 Sites/Vinext 集成。

```sh
npm run install:ci
npm run db:generate
npm run build
npm run dev
node --experimental-strip-types tests/ledger-domain.test.ts
node --experimental-strip-types tests/push-adapters.test.ts
```

生产数据使用 Sites D1，绑定名称 `DB`；通过 Sites 发布流程应用 `drizzle/` 的迁移。不要在请求处理中创建或更改表。私有网站使用平台登录与服务访问边界。

运行环境键：`SITES_SERVICE_ACCESS_TOKEN`、`CONFIG_ENCRYPTION_SECRET`（均为服务端秘密），以及 `OWNER_PRIVATE_SERVICE_ACCESS=true`（只适用于保持本人私有访问的网站）。开发模拟凭据与生产凭据分离。

## 开源来源

CSV 状态机、中文账单字段映射、通知解析及分类逻辑改编自 [zyz674/moneybook](https://github.com/zyz674/moneybook)，参考提交 `f8023c9931818222a495dce834aaa24ac9d9b089`。原项目为 MIT 许可，保留于 `THIRD_PARTY_LICENSES/moneybook-MIT.txt`，并在改编模块内注明原版权。

本版本补充了跨渠道疑似重复核对、完整逐笔日报、严格金额精度、服务业务状态检查、失败重试、推送分片、私有访问与凭据加密。
