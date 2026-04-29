---
name: network
description: "在处理网络连接诊断与代理排障时使用。USE WHEN: 请求失败、主机不可达、DNS、TLS、代理、路由、网络环境问题、可用代理判断。KEYWORDS: network, dns, tls, proxy, http, socks, vpn, connectivity, timeout, git, npm, 网络, 代理, DNS, TLS, 连通性"
---

**AI必须无条件严格遵守skill要求，且必须自检有没有遵守，强制执行。**

## 概述

说明如何分层判断 DNS、连通性、TLS、HTTP 与代理问题，并用真实验证定位故障。

## 核心原则

### 不要猜测，先识别失败层级，再提出修复方向

网络问题必须先判断失败发生在 DNS、TCP、TLS、HTTP、代理还是应用层，然后再给修复建议。没有分层定位前，不要直接下结论说“是代理问题”或“是服务挂了”。

### 严格区分 DNS、TCP 连通性、TLS 握手、HTTP 响应、代理行为和应用层失败

这些层级的症状、验证方法和修复动作都不同，不能混成一个“请求失败”。只有分清层级，修复建议才会准确。

```powershell
# 正例：按层验证
Resolve-DnsName api.example.com
Test-NetConnection api.example.com -Port 443
curl.exe -vk https://api.example.com/health
```

### 代理是否存在，与代理是否真正生效、可达、可转发，是不同问题

看到配置里有代理，不等于请求真的走了代理；请求走了代理，也不等于代理能连出去并成功转发。三者必须分别验证。

### 同时检查环境变量、工具级代理设置和系统级代理设置

排障时不能只看一种来源。环境变量、`git` / `npm` / `pnpm` 等工具的本地配置，以及系统级代理都可能单独影响结果。

```powershell
# 正例：同时检查三层代理配置
Get-Item Env:http_proxy
git config --get http.proxy
netsh winhttp show proxy
```

### 优先相信真实连通性验证，而不是静态配置本身

配置文件、环境变量和 UI 面板只能说明“看起来配了什么”，不能证明“现在真的通”。优先信任实际解析、握手、请求和返回结果。

### 在 Windows 上，相关时同时检查系统代理和 WinHTTP 代理

Windows 上经常出现浏览器能走系统代理，但 CLI 仍然失败，或者 WinHTTP 和系统代理不一致。涉及命令行工具、安装器、脚本或服务时，必须把两者都检查一遍。

### AI 完成网络排障后必须严格自检，并形成自我反馈

网络排障完成后，AI 至少要检查四件事：

1. 有没有先分清 DNS、TCP、TLS、HTTP、代理和应用层。
2. 有没有用真实连通性验证支撑结论，而不是只看静态配置。
3. 代理相关时，是否同时检查了环境变量、工具级配置、系统代理和 Windows 下的 WinHTTP。
4. 是否形成了明确反馈，说明故障层级、验证结果、修复动作和剩余风险。

```text
自检反馈示例
- failure layer: TLS handshake
- validation: DNS and TCP passed, TLS failed with certificate mismatch
- proxy: env and tool config checked, proxy path not involved
- remaining risk: server-side certificate rotation status not yet verified
```