# GitHub 同步与恢复

本次同步日期：2026-10-13。仓库为 [silenpeaceful-ops/juzhang](https://github.com/silenpeaceful-ops/juzhang)，创建时设置为私有。

## 已同步的内容

- 当前聚账源码、数据库 schema 与两份迁移、通知及 CSV 解析、推送适配器和测试。
- 生产第 5 版及之前的 5 次开发提交历史。生产第 5 版对应 `41bde16ade4a6cfd4cf9b2d84b485261cb36c3f8`。
- 中文 README、使用与开发说明、iPhone 自动化设计、完整续接报告。
- 产品说明、白灰界面设计规范、设计方向和使用合成数据的手机/桌面预览图。
- 上游 MIT 版权与许可证文件。

仓库保存项目与开发进度，不包含真实账本、生产数据库、运行密钥、设备短信或手机镜像画面。依赖缓存、构建产物和工具临时文件不放入当前源码快照；历史提交中保留了一份无凭据的 TypeScript 编译信息，当前版本已移除并加入忽略规则。安装在开发电脑上的全局技能没有作为项目依赖复制；所用 `frontend-design`、`impeccable` 的设计结果已经保存到项目文档。

## 重新获取项目

在已登录该 GitHub 账号的电脑上执行：

```sh
git clone https://github.com/silenpeaceful-ops/juzhang.git
cd juzhang
```

然后按 [开发说明](development.md) 安装和初始化本地数据库。若继续使用既有生产网站，先读 [当前状态](current-status.md)，复用 `.openai/hosting.json` 中的网站标识，不要重复创建网站或每日任务。若准备独立部署，应为自己的部署单独配置身份、数据库、服务访问和秘密值，不能照搬既有生产资源标识。

## 后续更新

GitHub 仓库与 Sites 托管源码是两个独立的同步目标。本次 GitHub 上传没有发布新的网站版本，也没有创建 GitHub Actions 自动部署任务。

修改后可先检查将提交的文件，再提交并推送：

```sh
git status
git diff
git add <需要同步的文件>
git commit -m "说明本次修改"
git push origin main
```

若更改需要上线，还需完成 Sites 的构建与发布流程。数据库、推送密钥和接入请求头通过原平台的运行配置管理，不通过 GitHub 传递。
