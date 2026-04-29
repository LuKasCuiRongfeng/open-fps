---
name: testing
description: "在处理测试策略、补测判断与验证取舍时使用。USE WHEN: 单元测试、集成测试、端到端测试、补测判断、测试分层、mock 策略、回归保护、验证方式选择。KEYWORDS: testing, test, unit test, integration test, e2e, mock, stub, fake, regression, verification, coverage, 测试, 单测, 集成测试, 端到端, 回归, 验证"
---

**AI必须无条件严格遵守skill要求，且必须自检有没有遵守，强制执行。**

## 概述

说明如何按风险选择测试层级、补回归保护，并避免低价值或高脆弱测试。

## 核心原则

### 优先测试稳定行为边界、输入输出契约和高风险路径，不把实现细节当主要目标

测试首先应证明系统对外行为是否正确，而不是证明内部函数刚好按某个顺序被调用了一遍。

```ts
// 反例
expect(saveUserMock).toHaveBeenCalledTimes(1);

// 正例
expect(result).toEqual({ ok: true, id: "u_123" });
```

### 测试投入应与风险、变更频率和故障代价匹配，不为覆盖率数字机械加测试

不是每段代码都值得同样强度的测试。风险越高、变化越频繁、故障代价越大，越应该投入更高质量的自动化验证。

### 能用更轻的测试层级验证的，就不要默认上更重的集成或端到端测试

如果单元测试或轻量集成测试已经足够证明行为，就不要直接上更慢、更脆弱、更难定位的 E2E。

### mock 只用于隔离不稳定、昂贵或难控制的外部边界，不要把系统内部协作全部 mock 掉

数据库、网络、时间、第三方服务这类外部边界适合 mock；系统内部真实协作如果全部 mock 掉，测试就很容易只剩下“证明 mock 配得对”。

### 测试本身也要可维护：可读、稳定、低脆弱，失败时能快速定位真实问题

测试文件也属于工程资产。命名、夹具、断言和失败输出都要服务于快速定位问题，而不是制造更多噪音。

### 修改代码后，优先补能阻止同类回归再次出现的自动化测试，而不是只做一次性手工验证

如果这次改动是在修 bug、补边界或调整关键逻辑，优先补一条能挡住同类问题再次出现的自动化测试，而不只是手工点一次证明“现在好了”。

### AI 写完测试或测试策略后必须严格自检，并形成自我反馈

测试相关工作完成后，AI 至少要检查四件事：

1. 测试是否真正覆盖了对外行为、契约和高风险路径。
2. 测试层级是不是过重，是否存在低价值 mock。
3. 新增验证是否能阻止同类回归，而不是只验证一次当前修复。
4. 是否形成了明确反馈，说明运行了哪些验证、哪些没跑、为什么没跑。

```text
自检反馈示例
- behavior coverage: public success and failure paths covered
- test layer: unit test chosen instead of slower integration path
- mocks: only external API boundary mocked
- remaining risk: browser-only drag interaction still lacks E2E coverage
```
