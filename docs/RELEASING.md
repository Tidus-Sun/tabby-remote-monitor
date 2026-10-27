# 发布与维护

- 源码仓库：[Tidus-Sun/tabby-remote-monitor](https://github.com/Tidus-Sun/tabby-remote-monitor)。
- npm 包：[tabby-remote-monitor](https://www.npmjs.com/package/tabby-remote-monitor)。
- 首次公开预览版本：`0.1.14`。

Tabby 的插件管理器通过 npm 发现插件。公开发布的包需要保留 `tabby-plugin` 关键词；GitHub 源码和 Release 附件不能代替 npm 发布。参考 [Tabby 插件开发说明](https://github.com/Eugeny/tabby/blob/master/HACKING.md#plugins)。

## 准备版本

使用 `.node-version` 和 `packageManager` 指定的开发环境。确认 `package.json` 版本号、README 中的安装包文件名和更新记录一致，将本次发布内容从 `Unreleased` 归入版本条目并记录日期。已发布的 npm 版本不能覆盖，后续更新必须使用新版本号。

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm exec playwright install chromium
pnpm test:browser
```

将变更提交并推送到 `main`，确认当前提交的 Windows、macOS、Linux CI 全部成功。Linux CI 还会执行浏览器与 Angular 设置测试，生成安装包和截图。CI 当前不会自动上传 npm 或创建 GitHub Release。

发布前检查：

- 包含 `dist/index.js`、README、许可证、截图和本地安装脚本。
- 不包含 `node_modules`、开发缓存、真实 SSH 配置或凭据。
- README 的截图和项目链接可在 GitHub 与 npm 页面访问。
- 如有运行时代码变更，验证实际 Tabby SSH 连接；本机 Tabby russh 的可选测试不由普通 CI 代替。

## 登录 npm 与检查包

维护者需要自己的 npm 账号和发布权限，交互式发布按 npm 提示完成身份验证。认证只交给 npm CLI / 官方网站，不把令牌写入仓库。

```sh
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
npm publish --dry-run --access public --registry=https://registry.npmjs.org/
```

`--dry-run` 只预检。项目的 `prepack` 会执行生产构建；`publishConfig` 固定公开 npm registry、公开访问和 `latest` 标签。参考 [npm 发布流程](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/)。

## 发布已检查的安装包

```sh
npm pack
npm publish ./tabby-remote-monitor-0.1.14.tgz --access public --tag latest --registry=https://registry.npmjs.org/
```

将示例中的版本号替换为本次版本。发布生成并检查过的同一个 `.tgz`，保存其完整性摘要用于发布后比对。

## 发布后验证

```sh
npm view tabby-remote-monitor version dist-tags dist.integrity --registry=https://registry.npmjs.org/
```

确认 `latest` 指向本次版本，registry 中的完整性摘要与发布包一致。在独立的空目录中执行 `npm install tabby-remote-monitor@0.1.14 --registry=https://registry.npmjs.org/`，检查包入口和必需文件。之后在干净的 Tabby 配置中通过插件管理器安装、重启并验证 Linux SSH 监控。

Tabby 搜索 `remote-monitor` 后，应显示这个包及正确的项目地址。npm 搜索索引可能延迟；先确认包页面和直接安装可用，再等待索引更新，不通过重复发布同一版本解决搜索延迟。旧本地安装的迁移步骤见 [README](../README.md#从插件市场安装)。

## 可选的 GitHub Release 与自动发布

需要 GitHub Release 时，为已发布提交创建对应 `v版本号` 标签，填写更新说明并附加同一 `.tgz`。0.1.x 可标为预览版。GitHub 自动生成的源码归档没有 `dist`，使用者需要构建；npm 安装包已包含生产构建。

后续可单独配置 [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)，绑定本仓库的发布工作流，再使用 GitHub Actions 的 OIDC 身份发布。当前 CI 仅测试和打包。
