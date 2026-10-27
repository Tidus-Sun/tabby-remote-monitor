# 发布源码与预览包

目标仓库：`https://github.com/Tidus-Sun/tabby-remote-monitor`。

## 首次上传源码

1. 在 GitHub 的 `Tidus-Sun` 账号下创建名为 `tabby-remote-monitor` 的空仓库。需要公开源码时选择 Public；不要额外初始化 README、许可证或 `.gitignore`，这些文件已经在本地提交中。
2. 在项目目录确认 `git status`、`git log -1` 和 `git remote -v`。本地默认分支为 `main`，`origin` 指向上述仓库。
3. 使用已配置的 GitHub Git 凭据执行 `git push -u origin main`。浏览器已登录不等同于命令行 Git 已完成认证；不要将 Token 写入远程 URL、源码或 `.npmrc`。
4. 查看 GitHub Actions 的 CI 结果。首次实际运行通过前，不宣称 Linux / macOS 的远程 CI 已验证。

## 准备一个版本

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm exec playwright install chromium
pnpm test:browser
pnpm pack
```

检查以下内容：

- `package.json` 版本号、README 安装包文件名和更新记录一致。
- `Unreleased` 中准备发布的条目已归入该版本，并记录实际发布日期。
- 截图和说明对应当前界面，所有测试跳过项及兼容性范围如实说明。
- 安装包包含 `dist/index.js`、许可证及安装脚本，不包含开发缓存、真实 SSH 配置或凭据。
- Windows 上补测 Tabby 的 russh 后端；目标 Linux 主机实际连接验证按发行环境执行。

## 发布 GitHub Release

首次公开分发建议将 `v0.1.14` 标为预览版。源码归档和安装包是两种内容：GitHub 自动生成的 Source code 归档没有 `dist`，使用者需要自行构建；附加的 `.tgz` 包经过 `pnpm pack` 构建，可以解压后运行包内的安装脚本。

创建并推送版本标签、发布 Release、上传附件属于实际发布操作，在决定发布时执行。CI 当前仅生成可下载的工作流产物，不会自动发布 Release 或 npm。

源码上传 GitHub 与上架 Tabby 插件市场是独立步骤。本项目尚未发布到 npm；不要在未确认 npm 包名归属和发布账号前执行 `pnpm publish`。
