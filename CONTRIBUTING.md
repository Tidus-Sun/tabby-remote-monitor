# 开发与贡献

## 开发环境

- Node.js 24.19.0（`.node-version`）。
- pnpm 11.25.0（`package.json` 的 `packageManager`）。
- Git；Windows 的采集脚本测试还会使用 Git for Windows 自带的 Bash。

```sh
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm check
pnpm exec playwright install chromium
pnpm test:browser
```

Linux 首次准备浏览器时可用 `pnpm exec playwright install --with-deps chromium`；该命令会安装系统依赖，可能需要 sudo。已经安装 Chrome / Edge 的环境也可设置 `BROWSER_EXECUTABLE` 为其完整路径。

无需安装 Tabby 即可执行默认测试。所有测试服务器仅监听 `127.0.0.1`，使用动态生成的测试密钥，不连接用户保存的 SSH 主机。安装测试仅修改临时目录，不修改实际 Tabby 配置。

Angular、Tabby、RxJS 是宿主提供的运行依赖，生产打包保留 external。开发依赖额外声明了浏览器测试和安装测试所需模块；`pnpm-workspace.yaml` 只忽略宿主提供的 `@ng-bootstrap/ng-bootstrap` 缺失提示，未将该 UI 库打入插件。

## 测试命令与范围

| 命令 | 范围 |
| --- | --- |
| `pnpm typecheck` | 源码与测试的 TypeScript 检查 |
| `pnpm test` | 指标、历史、多语言、配色、生命周期、SSH 传输、采集脚本与安装测试 |
| `pnpm build` | Electron renderer 生产构建 |
| `pnpm check` | 依次执行上面三项 |
| `pnpm test:browser` | 真实状态栏组件与 Angular 设置组件的浏览器测试 |
| `pnpm screenshots` | 将上一轮浏览器测试的六张示例截图复制到 `docs/images` |
| `pnpm pack` | 构建并生成可安装的 `.tgz` 包，不上传到 npm |

当前共有 39 项 Node 测试。在有 Git Bash 的 Windows 上，默认通过 37 项，跳过 2 项需要 Tabby russh 的测试；Linux / macOS 另外跳过 Windows 专用安装测试。缺少 POSIX shell 时采集脚本测试会明确跳过。浏览器测试独立运行，不计入这 39 项。

对已安装 Tabby 的 Windows 机器，可补测宿主原生 SSH 后端：

```powershell
$env:TABBY_RUSSH = 'D:\Program Files\Tabby\resources\app.asar.unpacked\node_modules\russh'
$env:NODE_PATH = "$PWD\node_modules"
pnpm test
```

路径请按实际安装位置调整。`POSIX_SHELL` 可覆盖 shell 路径，`TABBY_ARBORIST_MODULE` 可用于检查其他 Arborist 版本。模拟时钟的长期采样测试和 loopback SSH 测试不能代替目标 Linux 发行版的实际 `/proc`、账号权限、网络条件和长期运行验证。

## 提交改动

- 针对行为修复增加可复现的回归检查；界面修改执行两组浏览器测试。
- 中英文文案同步维护 `src/i18n.ts`；远端文本始终按文本渲染。
- 修改依赖后提交 `package.json`、`pnpm-lock.yaml`，必要时同步构建脚本许可。
- 在 `CHANGELOG.md` 的 `Unreleased` 中记录面向用户的变化。
- 截图只使用测试示例数据。检查主机名、路径、终端内容，避免提交真实连接资料。
- 不提交 `node_modules`、`dist`、`.artifacts`、`.reference`、本地配置或密钥。

GitHub Actions 在三个操作系统上运行基础检查，Linux 运行浏览器测试并保留安装包与截图。工作流只有仓库读取权限，没有发布 npm、创建 Release 或上传源码的步骤。
