---
name: python
description: "在处理 Python 实现与环境管理相关任务时使用。USE WHEN: Python、类型标注、脚本、包管理、虚拟环境、异步 IO、数据处理、CLI、Web 服务实现判断。KEYWORDS: Python, uv, pyproject, venv, typing, asyncio, dataclass, pydantic, pytest, CLI, script, packaging, Python, 类型, 虚拟环境, 包管理, 异步"
---

**AI必须无条件严格遵守skill要求，且必须自检有没有遵守，强制执行。**

## 概述

说明如何在 Python 项目里处理环境、依赖、类型、并发边界和工程化实现。

## 核心原则

### 默认使用 `uv` 管理 Python 环境、依赖和命令执行

环境创建、依赖安装、同步和命令执行默认优先走 `uv`，避免把虚拟环境、`pip`、`python` 和脚本执行入口拆成多套不一致习惯。

```bash
# 正例
uv sync
uv add httpx
uv run pytest
```

### 优先以 `pyproject.toml` 作为项目配置与依赖声明中心

项目配置、依赖、工具链和元数据优先集中在 `pyproject.toml`，不要把同类配置拆到多个入口里，增加维护成本和冲突概率。

```toml
[project]
name = "weather-lab"
dependencies = ["httpx", "pydantic"]

[tool.pytest.ini_options]
addopts = "-q"
```

### 类型、数据模型和边界要明确，优先使用标准 `typing` 与主流建模方案

函数签名、返回值、配置模型和外部输入边界要尽量明确。能用标准 `typing`、`dataclass`、`TypedDict`、`Protocol` 或主流数据模型库表达的，就不要长期停留在动态字典和隐式约定上。

```py
# 反例
def get_total(line):
    return line["price"] * line["count"]

# 正例
class CartLine(TypedDict):
    price: float
    count: int

def get_total(line: CartLine) -> float:
    return line["price"] * line["count"]
```

### 默认优先使用成熟、热门的第三方库，不要重复造轮子

如果 `httpx`、`pydantic`、`sqlalchemy`、`pytest`、`pandas` 等成熟库已经能低成本解决问题，就不要为了“纯手写”偏好重复实现一套低质量替代品。

### I/O 密集任务优先 `asyncio`，CPU 密集任务优先进程、原生扩展或专门库

并发模型要和工作负载匹配。I/O 密集任务优先异步；CPU 密集任务优先多进程、原生扩展、NumPy、Rust 扩展或其他真正能绕开 GIL 的方案。

```py
# 正例
async def fetch_all(client: httpx.AsyncClient, urls: list[str]) -> list[httpx.Response]:
    tasks = [client.get(url) for url in urls]
    return await asyncio.gather(*tasks)
```

### 环境与依赖边界必须清晰，不要混用系统 Python、全局包和项目环境

项目应始终在明确的虚拟环境里运行，命令执行要经过项目环境，不要一部分依赖来自系统 Python，一部分来自全局 `pip`，另一部分再来自项目本地缓存。

### AI 写完 Python 代码后必须严格自检，并形成自我反馈

Python 代码完成后，AI 至少要检查四件事：

1. 环境和命令执行是否保持在正确项目环境里。
2. 类型、数据模型和外部输入边界是否足够清楚。
3. 并发模型是否和 I/O / CPU 负载匹配，没有把错误工作负载放到错误模型里。
4. 是否形成了明确反馈，说明运行了什么验证、还剩哪些风险。

```text
自检反馈示例
- environment: uv-managed project environment used
- typing: public functions and config models typed
- validation: ruff, pytest and uv run build step passed
- remaining risk: production data volume not yet benchmarked
```