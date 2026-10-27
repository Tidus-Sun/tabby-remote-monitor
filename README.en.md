# Tabby Remote Monitor

English · [简体中文](https://github.com/Tidus-Sun/tabby-remote-monitor/blob/main/README.md)

A remote monitoring status bar for Linux hosts connected through Tabby's built-in SSH client, similar to MobaXterm remote monitoring. Each SSH terminal pane has its own system metrics and hover panels.

Current version: **0.1.15 · Preview**. The interface supports **English and Simplified Chinese**, with automatic language selection based on Tabby.

[npm package](https://www.npmjs.com/package/tabby-remote-monitor) · [Source](https://github.com/Tidus-Sun/tabby-remote-monitor) · [Changelog](https://github.com/Tidus-Sun/tabby-remote-monitor/blob/main/CHANGELOG.md) · [Report an issue](https://github.com/Tidus-Sun/tabby-remote-monitor/issues)

## Preview

These screenshots use the actual plugin components with fixture data and a demonstration terminal background. They contain no real server or account information.

![CPU usage history for the last 60 seconds](https://raw.githubusercontent.com/Tidus-Sun/tabby-remote-monitor/main/docs/images/cpu-history.png)

<details>
<summary>Disk, memory, network and appearance panels</summary>

![Disk mount points and usage](https://raw.githubusercontent.com/Tidus-Sun/tabby-remote-monitor/main/docs/images/disk-details.png)
![Memory details](https://raw.githubusercontent.com/Tidus-Sun/tabby-remote-monitor/main/docs/images/memory-details.png)
![Cumulative traffic for all network interfaces](https://raw.githubusercontent.com/Tidus-Sun/tabby-remote-monitor/main/docs/images/network-details.png)
![Dark glass appearance settings](https://raw.githubusercontent.com/Tidus-Sun/tabby-remote-monitor/main/docs/images/appearance-dark.png)
![Light appearance settings](https://raw.githubusercontent.com/Tidus-Sun/tabby-remote-monitor/main/docs/images/appearance-light.png)

</details>

## Features

- **Host and CPU:** hostname, current CPU usage, an inline graph and a hover chart covering the last 60 seconds, with average and peak usage.
- **Memory:** used / total RAM, plus available and free memory, buffers, cache, reclaimable slab, shared memory and swap in the details panel.
- **Network:** receive and transmit rates for the selected interfaces. Hover to inspect cumulative traffic for every interface, including loopback and virtual devices.
- **Disks:** a separate indicator for each visible mount point. Hover for aligned columns showing mount paths, devices, filesystems, capacity and usage. Virtual filesystems can be included in settings.
- **Appearance:** translucent glass effects, five color presets, custom background and accent colors, opacity and blur controls, with a live settings preview.
- **Interaction:** hover panels above their indicators, keyboard focus and Escape support, split panes, compact layouts, pause / resume and manual refresh.
- **Connection handling:** background sampling by default, bounded CPU history, retry backoff, stale-data indicators and cleanup when a pane closes. Pausing or reconnecting affects the history; missing readings are not fabricated.

## Install from Tabby

1. Open **Settings → Plugins → Available** and search for `remote-monitor`.
2. Select **remote-monitor** (npm package **`tabby-remote-monitor`**), with the project link pointing to **Tidus-Sun/tabby-remote-monitor** and npm publisher **sswh317**.
3. Install it, save your terminal work and restart Tabby.
4. Connect to a Linux host using Tabby's built-in SSH connection. The status bar appears at the bottom of the terminal pane.

Tabby orders available plugins using npm search scores. If the search still shows many unrelated plugins, look further down the list. Newly published packages and updates may take time to appear. Already installed plugins are hidden from **Available**; look under **Installed** instead.

For a direct npm installation, open **Settings → Plugins → Plugins folder** and run this command in that directory:

```sh
npm install --save tabby-remote-monitor@latest --registry=https://registry.npmjs.org/
```

Restart Tabby after saving your work. This command requires Node.js and npm; installing through Tabby's plugin manager does not require a separate npm installation.

### Migrate from a local development installation

The repository's local installer registers a `file:` dependency. Run the same npm command above in Tabby's plugin directory to replace it with the published npm package, then restart Tabby. Existing Remote Monitor settings are preserved. You may keep the old `remote-monitor-local` and backup directories; future updates can use the plugin manager.

## Requirements and metrics

- **Connection:** Tabby's built-in SSH client. Local Linux / WSL terminals and an `ssh` command typed inside a local terminal are not monitored.
- **Remote host:** Linux with SSH exec enabled, a readable `/proc`, and `sh`, `uname`, `cat`, `head` and a `df` implementation supporting `-kP -l`. No root access, sudo, Python or remote agent is required.
- **Authentication:** the plugin reuses the authenticated SSH connection, including Tabby's host-key checks, jump hosts and proxies. It does not read passwords or private keys. Collection uses separate exec channels and does not type commands into the interactive shell or write remote files.
- **CPU:** computed from changes in `/proc/stat`. The first sample and counter resets show no percentage until a comparison is available. Background sampling is enabled by default to preserve history across tab switches.
- **Memory:** used RAM is total minus available RAM. Older Linux kernels use an estimate when `MemAvailable` is absent. Some detail fields overlap and should not be added together.
- **Network:** rates are based on `/proc/net/dev` counters and remote uptime. Down means traffic received by the remote host; up means traffic sent by it. These values include all traffic on the selected interfaces, not just the current SSH session. Cumulative counters can reset after a reboot or device recreation.
- **Disks:** local filesystems reported by `df -kP -l`. NFS/CIFS and other remote mounts are excluded. Usage follows `df`, including reserved blocks; virtual filesystems are hidden by default.

System metrics are sampled every **2 seconds** by default, disks every **15 seconds**, with an **8-second** collection timeout. Requests run serially. Failed collection backs off up to 30 seconds; old readings are marked stale. CPU history is kept in memory and is not saved to disk.

## Configure

Open **Settings → Remote Monitor** to change the language, appearance, sampling intervals, timeouts, network interfaces and visible indicators. Changes apply to open terminal panes and are saved in Tabby's configuration.

- Set the language to **English**, **简体中文**, or automatic selection.
- Automatic network selection uses the valid IPv4 default route with the lowest metric. If none is available, it uses non-loopback interfaces. Select interfaces explicitly on hosts with bridges, bonds or containers to avoid counting the same traffic twice.
- Enable **pause when hidden** if background polling is unwanted. Returning to a paused tab leaves a pause in its history.
- Glass blur affects the content behind the status bar and panels. Showing the desktop through Tabby also depends on Tabby's own window transparency settings.

## Build and test

Development uses **Node.js 24.19.0** and **pnpm 11.25.0**. The `engines.node` field describes the plugin runtime requirement; use the pinned development versions for the build and test tools.

```sh
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm check
pnpm exec playwright install chromium
pnpm test:browser
pnpm pack
```

`pnpm check` runs type checking, unit and available SSH / installer integration tests, then the production build. `pnpm pack` produces **`tabby-remote-monitor-0.1.15.tgz`**. The source repository does not include `dist`; the npm package includes the production bundle.

To install a development build locally:

```sh
pnpm install:local
```

For a portable Tabby installation or a custom plugin directory:

```sh
node scripts/install-local.mjs --plugins-dir "/path/to/tabby/plugins"
```

The local installer registers a persistent local dependency and creates backups. Save your work and restart Tabby after installation. See the [Chinese development guide](https://github.com/Tidus-Sun/tabby-remote-monitor/blob/main/CONTRIBUTING.md) for additional test options.

## Compatibility and validation

The main tested target is **Tabby 1.0.238 / Angular 15 / russh**. Support for the older `ssh2.exec()` transport is retained, but full UI compatibility with older Tabby releases requires testing on those releases.

GitHub Actions runs builds and tests on Windows, macOS and Linux. Linux also runs browser and Angular settings tests. Two tests using Tabby's installed native russh module are optional and require that module locally; ordinary CI does not include it. Installer and SSH tests use isolated directories and loopback fixtures. These checks do not replace testing against the intended Linux distribution and SSH server.

Please report issues with your Tabby version, operating system, remote Linux distribution, plugin version and reproduction steps. The [changelog](https://github.com/Tidus-Sun/tabby-remote-monitor/blob/main/CHANGELOG.md) and [maintainer release guide](https://github.com/Tidus-Sun/tabby-remote-monitor/blob/main/docs/RELEASING.md) are currently in Chinese.
