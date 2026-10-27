# Tabby Remote Monitor

[English guide](https://github.com/Tidus-Sun/tabby-remote-monitor/blob/main/README.en.md) · 简体中文

A remote monitoring status bar for Linux hosts connected through Tabby's built-in SSH client, similar to MobaXterm remote monitoring. View CPU usage and a 60-second history graph, used / total memory, network transfer speeds and cumulative traffic, and disk usage for each mount point. Hover over an indicator for details. Includes English and Simplified Chinese interfaces, translucent glass effects, color presets and custom colors.

**Install:** open **Settings → Plugins → Available** in Tabby, search for `remote-monitor`, install `tabby-remote-monitor`, and restart Tabby after saving your terminal work. Then connect to a Linux host through built-in SSH. See the [English guide](https://github.com/Tidus-Sun/tabby-remote-monitor/blob/main/README.en.md) for requirements, configuration and migration from a local development installation.

在每个 Tabby SSH 终端窗格底部显示 Linux 主机信息，类似 MobaXterm Remote monitoring。

状态栏以统一的 SVG 图标标识主机、CPU、内存、收发流量与磁盘，并保留主机名和各项数值；CPU 数值旁显示近期走势的迷你曲线，深色底色与细边框标明图表范围。

当前版本 **0.1.15 · 预览版**。支持内置 SSH 连接的 Linux 主机；界面提供简体中文与英文。

[npm](https://www.npmjs.com/package/tabby-remote-monitor) · [更新记录](https://github.com/Tidus-Sun/tabby-remote-monitor/blob/main/CHANGELOG.md) · [开发与贡献](https://github.com/Tidus-Sun/tabby-remote-monitor/blob/main/CONTRIBUTING.md) · [发布说明](https://github.com/Tidus-Sun/tabby-remote-monitor/blob/main/docs/RELEASING.md) · [问题反馈](https://github.com/Tidus-Sun/tabby-remote-monitor/issues)

## 界面预览

以下图片由真实插件组件配合本地示例数据生成，终端背景为测试展示页，不包含真实服务器或账号信息。

![CPU 最近 60 秒历史曲线](https://raw.githubusercontent.com/Tidus-Sun/tabby-remote-monitor/main/docs/images/cpu-history.png)

<details>
<summary>磁盘、内存、网络与外观设置截图</summary>

![磁盘挂载点与容量](https://raw.githubusercontent.com/Tidus-Sun/tabby-remote-monitor/main/docs/images/disk-details.png)
![内存详情](https://raw.githubusercontent.com/Tidus-Sun/tabby-remote-monitor/main/docs/images/memory-details.png)
![所有网络设备的累计流量](https://raw.githubusercontent.com/Tidus-Sun/tabby-remote-monitor/main/docs/images/network-details.png)
![深色磨玻璃外观设置](https://raw.githubusercontent.com/Tidus-Sun/tabby-remote-monitor/main/docs/images/appearance-dark.png)
![浅色磨玻璃外观设置](https://raw.githubusercontent.com/Tidus-Sun/tabby-remote-monitor/main/docs/images/appearance-light.png)

</details>

## 功能

- 外观支持半透明磨玻璃、深蓝 / 青绿 / 紫色 / 石墨 / 浅色五套配色、自定义背景色和强调色；状态栏与详情面板分别调节不透明度，模糊程度可调。文字与强调色根据背景明暗调整，CPU 曲线保留深色底色。在“设置 → Remote Monitor → 外观”中有使用示例数据的实时预览，指向图标可查看面板；拖动滑块时预览，松开后应用，支持恢复默认外观。
- 支持简体中文与英文，默认跟随 Tabby 界面语言；可在“设置 → Remote Monitor → 语言”中固定为简体中文或 English。状态栏、悬浮面板、设置和插件错误提示随选择即时更新，不重置 CPU 历史或重新采集；暂不支持的语言回退为英文。
- Hostname、CPU 使用率、内存已用 / 总量、网卡接收 / 发送速率。
- 鼠标指向内存图标区域，即在其上方显示内存详情：已用 / 总量、可用、空闲、缓冲区、文件缓存、可回收 Slab、共享内存及 Swap 已用 / 总量与可用容量。状态栏不再显示内存百分比；详情缺失项显示 `—`，未启用 Swap 时明确标注。
- 每个可见磁盘挂载点独立显示一个标签，包含磁盘图标、挂载路径与使用率；标签较多时可横向滚动。鼠标指向任意挂载点，即在该标签上方显示完整磁盘详情：所有挂载点、设备、文件系统、已用 / 总量、使用率分列对齐，数字右对齐；同时保留 Swap 与系统负载。虚拟文件系统仍按原设置筛选。
- 鼠标指向 CPU 图标区域即可查看类似任务管理器的最近 60 秒使用率图表，含 0–100% 网格、当前值、有效采样平均值和峰值。数据从当前 SSH 连接开始积累，默认在后台继续采集，切换标签页、普通刷新与正常采样延迟不会人为打断曲线。短暂失败恢复后用前后两次有效计数器计算期间平均使用率，不补造中间采样点；手动暂停仍保留空档，重连后重新收集。历史不保存到磁盘。
- 鼠标指向网络收发速率，即在该区域上方显示所有网络设备各自的累计接收 / 发送量，包含 lo 和虚拟网卡；累计值来自内核计数器，重启或设备重建后可能重置。
- 鼠标可移入详情面板查看和滚动，离开标签与面板后自动关闭；支持键盘聚焦查看和 Esc 关闭，面板在窄窗格内自动避让边缘。
- 详情面板正文 14px、标题 16px；磁盘、网络与内存列表共用约 27px 的紧凑单行布局和表格间距。过长的挂载点和设备名称可悬停查看完整内容；窄窗格中的磁盘表格支持横向滚动，采样刷新、切换语言或配色时保留滚动位置和键盘焦点。面板使用窗格上方的可用高度，仅内容超过可用空间时纵向滚动。
- 每个 SSH 窗格独立显示，适配 Tabby 分屏；窄窗格可横向滚动状态指标。
- 暂停 / 恢复、立即刷新、可选的后台标签页暂停、设置实时生效。需要减少后台采集时，可启用“暂停不可见标签页的采集”，此时切回标签页会留下暂停期间的空档。
- 失败后退避重试，断线后清空旧主机数据，重连重新采样；关闭窗格取消采集并回收通道与订阅。

## 从插件市场安装

1. 打开 Tabby 的 **设置 → 插件**，搜索 `remote-monitor`。
2. 选择包名为 **`tabby-remote-monitor`**、项目链接指向 [Tidus-Sun/tabby-remote-monitor](https://github.com/Tidus-Sun/tabby-remote-monitor) 的插件并安装。
3. 保存终端中的工作后重启 Tabby，连接 Linux SSH 主机。终端底部会显示监控状态栏，设置页面中会出现 **Remote Monitor**。

如果搜索后仍出现许多其他插件，请继续向下查找 `remote-monitor`；Tabby 按 npm 的搜索评分排序，新插件可能靠近列表底部。已经安装的插件会从“可用”列表隐藏，请在“已安装”页查找。

Tabby 的插件列表来自 npm 搜索，首次发布或更新后可能存在索引延迟。可先查看 [npm 包页面](https://www.npmjs.com/package/tabby-remote-monitor) 确认版本；需要手动安装时，在 Tabby「设置 → 插件 → 打开插件目录」显示的目录中执行：

```sh
npm install --save tabby-remote-monitor@latest --registry=https://registry.npmjs.org/
```

**从本地开发版迁移：** 如果此前运行过本项目的安装脚本，插件依赖登记为 `file:` 本地目录。请在上述 Tabby 插件目录执行同一条 `npm install` 命令，将本地依赖替换为 npm 版本，之后重启 Tabby。原有监控配置保留；旧的 `remote-monitor-local` 与备份目录可先保留。以后可通过插件管理器更新，不必再次运行本地安装脚本。

## 从源码或安装包安装

源码仓库不提交 `dist`，克隆后请先完成下方的“从源码构建”。已有包含 `dist/index.js` 的安装包时，可解压到独立目录并直接运行其中的安装脚本，无需构建依赖。Windows 可在项目或解压后的包目录执行（不需要 Node.js）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-local.ps1
```

跨平台 Node.js 安装方式：

```powershell
node scripts/install-local.mjs
```

保存终端中的工作后自行重启 Tabby，连接 Linux SSH 主机。设置页面中会出现 **Remote Monitor**。

默认插件目录：

| 系统 | 目录 |
| --- | --- |
| Windows | `%APPDATA%\tabby\plugins` |
| macOS | `~/Library/Application Support/tabby/plugins` |
| Linux | `${XDG_CONFIG_HOME:-~/.config}/tabby/plugins` |

便携版、自定义配置目录或测试安装可指定 Tabby「设置 → 插件 → 打开插件目录」显示的路径：

```powershell
node scripts/install-local.mjs --plugins-dir "D:\Apps\Tabby\data\plugins"
```

PowerShell 安装脚本对应参数是 `-PluginsDir "D:\Apps\Tabby\data\plugins"`。

安装脚本将本插件复制到 `node_modules/tabby-remote-monitor`，同时在 `remote-monitor-local` 保存独立的本地安装源，并将它以 `file:` 依赖登记到插件目录的 `package.json`。这样 Tabby 安装或更新其他插件时不会把它当作多余目录清理；请保留 `remote-monitor-local`。下次插件管理器操作时会自动同步锁文件。

重复安装会把旧插件及原插件清单备份到 `remote-monitor-backups`，保留其他插件的依赖声明，不改动 SSH 配置。卸载可使用 Tabby 插件管理器；手动卸载则先移除插件目录 `package.json` 中的 `tabby-remote-monitor` 依赖，再移除对应的 `node_modules/tabby-remote-monitor`，最后重启 Tabby。

也可安装本地生成的 npm 包：在 Tabby 插件目录执行 `npm install /absolute/path/tabby-remote-monitor-0.1.15.tgz`，并保留该安装包以供后续依赖整理使用。

## 从源码构建

开发和测试使用 **Node.js 24.19.0**（见 `.node-version`）与 **pnpm 11.25.0**（见 `package.json`）。已有 Node.js 后执行：

```sh
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm check
pnpm install:local
```

`pnpm check` 依次运行类型检查、单元及 SSH/安装集成测试、生产构建。`pnpm watch` 支持持续构建；更新后需要重新安装插件并重启 Tabby。打包使用 `pnpm pack`，生成 `tabby-remote-monitor-0.1.15.tgz`。

开发依赖由 `pnpm-lock.yaml` 固定，推荐使用 pnpm 复现构建。Angular / Tabby / RxJS 在插件运行时由宿主提供，构建中保持 external；`engines.node >=18` 描述插件运行代码的要求，不表示 Node.js 18 可以运行本仓库的开发测试。

浏览器回归测试的依赖也包含在项目内，无需额外缓存目录：

```sh
pnpm exec playwright install chromium
pnpm test:browser
```

Linux CI 使用 `pnpm exec playwright install --with-deps chromium` 安装系统依赖。浏览器截图生成在 `.artifacts/`；执行 `pnpm screenshots` 可更新 README 使用的示例截图。详细测试范围见 [CONTRIBUTING.md](CONTRIBUTING.md)。

Linux / macOS 开发时也可设置 `TABBY_PLUGINS` 为本项目的绝对路径，再从完全退出状态启动 Tabby。本机 Windows 版本按冒号拆分该变量，建议使用上述复制安装方式，避免盘符被拆开。不要同时安装两份插件。

## 指标口径与远端要求

- 仅支持 **Tabby 内置 SSH 连接**，不解析本地终端里手动运行的 `ssh`，也不监控本地 Linux / WSL。
- 远端必须是 Linux，允许 SSH exec，提供 `sh`、`uname`、`cat`、`head`、支持 `-kP -l` 的 `df`，且当前用户可读取 `/proc`。无需 root、sudo、Python、额外代理或写入远端文件。
- 复用 Tabby 已认证的连接，继承其主机密钥验证、跳板机和代理设置，不读取密码或私钥。监控只打开独立的无 PTY exec 通道，不会把命令写入交互 shell。
- CPU：对 `/proc/stat` 的前 8 项计数做差，`idle + iowait` 视为空闲，guest 不重复计算。第一帧及计数器重置后显示 `—`。
- 内存：`MemTotal - MemAvailable`；旧内核无 `MemAvailable` 时使用 free、buffers、cache、可回收 slab 与 shmem 估算。详情复用同次 `/proc/meminfo` 采样，不增加请求；缓存和共享等项目可能重叠，不可直接相加。字段含义参考 [Linux 内核 meminfo 文档](https://docs.kernel.org/filesystems/proc.html#meminfo)。
- 网络：`/proc/net/dev` 字节差 / `/proc/uptime` 时间差。**↓ 是远端接收，↑ 是远端发送**，代表所选网卡所有流量，单位 B/s、KiB/s、MiB/s，与当前 SSH 会话专属上传下载量不同。
- 网卡自动选择有效 IPv4 默认路由（目的地址和掩码均为零、已启用且未标记拒绝）中 metric 最低的接口；无默认路由（如部分 IPv6-only 主机）时使用所有非 lo 接口。建议为有 bridge、bond、容器网卡的主机手动指定网卡，避免重复相加。指定网卡不存在或计数回退时显示 `—`。
- 磁盘：`LC_ALL=C df -kP -l`，按 df 的使用率口径（包括保留块影响），支持带空格的挂载路径，以及负数可用容量和超过 100% 的使用率。仅本地文件系统，NFS/CIFS 等远程挂载不在第一版范围内；默认隐藏 tmpfs、squashfs 等虚拟文件系统。挂载类型来自 `/proc/mounts`。
- 默认系统信息间隔 2 秒，磁盘 15 秒，单次采集超时 8 秒。请求串行，间隔从上次请求完成后计算；磁盘刷新在下一次系统采样中执行。超时关闭监控通道并退避至最多 30 秒，不关闭用户的 SSH 连接。
- 采集命令输出结束标记后等待客户端确认；客户端收到完整帧才关闭该命令的标准输入并释放通道，避免结束通知早于排队中的数据回调造成截断。不完整结果会用新通道重试一次，仍失败才显示错误并进入退避；持续失败不会无限重试或生成虚假数据。
- `df` 遇到异常文件系统可能卡住；监控会取消自身通道，远端进程能否立即退出取决于服务器和内核状态。保留的旧数据会标记为暂停 / 失败及最近更新时间。

## 设置

所有选项可在 **设置 → Remote Monitor** 修改。对应 `config.yaml` 中的 `remoteMonitor`：

0.1.13 修复了设置未能写入 Tabby 配置的问题：通过配置代理逐项更新设置，保存后通知现有状态栏，重启后保留选择。旧版中仅预览生效、未实际保存的选择需要重新设置一次；保存失败时会在设置页面显示提示。

磨玻璃模糊的是状态栏和面板后方的内容；透出桌面还需要 Tabby 自身的窗口透明设置。背景较均匀时模糊效果会比较轻微。关闭磨玻璃后使用不透明纯色背景；不支持背景模糊或系统要求减少透明效果时自动使用纯色。外观变化即时生效，不改变采集计划或 CPU 历史。

```yaml
remoteMonitor:
  language: auto              # auto 跟随 Tabby；也可选 zh-CN 或 en
  glassEffect: true
  backgroundColor: '#151b26'
  accentColor: '#86b6ff'
  barOpacity: 80              # 不透明度 50–100%，数值越低越透明
  panelOpacity: 88            # 详情面板不透明度 50–100%
  blur: 16                   # 背景模糊半径 0–32px
  enabled: true
  interval: 2
  diskInterval: 15
  timeout: 8
  pauseWhenHidden: false      # 后台继续采集，保持 CPU 历史连续
  interfaces: ''              # 例如 eth0 或 eth0,eth1
  showHostname: true
  showCPU: true
  showMemory: true
  showNetwork: true
  showDisks: true
  showVirtualFilesystems: false
```

## 兼容性与验证

主要目标是本机 **Tabby 1.0.238 / Angular 15 / russh**。Tabby 内置 npm 包的版本标记仍是 `1.0.231-nightly.0`，所以开发依赖固定为这个版本；它与桌面应用版本不相同。保留基于 `ssh2.exec()` 的旧版传输适配，旧版 Tabby 的完整 UI 兼容性仍需实机确认。

自动测试覆盖语言选择与回退、翻译键及占位符完整性、错误提示切换、采样计算、CPU 历史窗口与缺测断点、挂载路径、内存回退、暂停 / 重连 / 销毁、输出上限、通道超时和晚到通道清理、完整帧确认、结束通知先到的竞态，以及不完整结果的有限重试和恢复。loopback SSH 测试使用真实 ssh2 与可选的本机 russh 后端，并包含连续 40 次碎片化输出采样。

0.1.14 的全面复查还补充了子网及拒绝路由筛选、负数磁盘可用容量、详情表格刷新时的横向滚动和焦点保留检查。使用模拟时钟覆盖 40 分钟连续采样，验证串行请求、连续失败后的 30 秒退避上限、恢复后的速率和 CPU 历史、磁盘刷新间隔及销毁后的定时器清理；这不等同于实际服务器上的 40 分钟运行测试。

安装回归测试默认使用项目内固定的 `@npmcli/arborist 9.9.1`，也可通过 `TABBY_ARBORIST_MODULE` 指定其他版本。测试在隔离目录复现旧安装被清理的问题，再验证 Node / Windows PowerShell 安装后更新其他插件、同版本重装仍保留监控插件；不操作真实插件目录。PowerShell 安装测试仅在 Windows 上执行。

可对本机安装的 russh 运行相同的真实 SSH 通道测试（仅连接测试自动创建的 127.0.0.1 服务器，不读取现有连接）：

```powershell
$env:TABBY_RUSSH = 'D:\Program Files\Tabby\resources\app.asar.unpacked\node_modules\russh'
$env:NODE_PATH = "$PWD\node_modules"
# Windows 默认从 PATH 中的 Git 安装位置查找 Bash；自定义路径时设置此项
$env:POSIX_SHELL = 'D:\Program Files\Git\bin\bash.exe'
pnpm test
```

测试服务器返回固定 Linux 数据用于验证协议；实际发行版 `/proc`、远程账号权限和生产 SSH 服务的完整联调需在目标 Linux 上验证。

GitHub Actions 在 Windows、Linux、macOS 上执行类型检查、单元和可用的集成测试、生产构建；Linux 额外运行两组浏览器测试并上传安装包及截图。CI 不包含宿主专有的 russh 模块，因此相关两项测试默认跳过，需使用上述本机 Tabby 路径补测。

浏览器测试通过 `pnpm test:browser` 执行，也可用 `BROWSER_EXECUTABLE` 指定已有 Chrome / Edge。脚本验证图标、磁盘列对齐、磁盘 / 网络 / 内存行高、内存容量与详情更新、CPU 曲线更新、悬浮面板、暂停恢复、键盘操作、安全显示远端文本、窄窗格布局和销毁。

架构：`collector.ts` 生成只读采集命令，`transport.ts` 隔离 SSH 后端，`metrics.ts` 解析与计算，`monitor.ts` 管理轮询生命周期，`decorator.ts` 接入 Tabby，`statusbar.ts` / CSS 渲染隔离样式的底栏，`settings.ts` 提供配置界面，`i18n.ts` 统一管理文案、语言解析和可翻译错误。增加语言时需补充词典、语言选项与语言匹配规则，并运行翻译完整性测试。远端主机名、路径和 SSH 后端返回的原始错误详情保留原文。

`appearance.ts` 负责颜色校验、配色预设、对比度调整与 CSS 变量；`appearance-preview.ts` 使用独立的本地示例数据复用状态栏组件，不创建 SSH 连接或采样定时器。`scripts/settings-smoke.cjs` 使用真实 Angular 设置组件、终端装饰器及开发依赖源码中的 Tabby `ConfigProxy`，验证只读配置节、逐项写入、YAML 保存与重新加载、现有状态栏更新、未知配置保留及保存失败后的提示和恢复；底层存储、语言通知与未连接的终端使用隔离替身。预设、实时预览、滑块保存、颜色选择、纯色模式、重置、中英文切换和销毁也在覆盖范围内。

参考：[Tabby 插件开发说明](https://github.com/Eugeny/tabby/blob/master/HACKING.md)、[TerminalDecorator](https://github.com/Eugeny/tabby/blob/v1.0.238/tabby-terminal/src/api/decorator.ts)、[SSH 实现](https://github.com/Eugeny/tabby/blob/v1.0.238/tabby-ssh/src/session/ssh.ts)。
