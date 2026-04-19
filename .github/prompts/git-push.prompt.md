---
name: git-push
description: 暂存变更、创建 git commit，并推送到当前远端分支。可使用 `--message` 指定提交信息；未提供时自动生成英文提交信息。
agent: agent
argument-hint: "[--message \"提交信息\"]"
---

暂存当前仓库变更，创建 commit，并推送到当前远端分支。

按以下流程执行：

1. 在执行任何 git 操作前，先检查仓库状态和变更文件。
2. 解析 prompt 输入。
3. 如果用户提供了 `--message` 参数，在去除首尾空白后，原样使用它作为 commit message。
4. 如果用户没有提供 `--message`，检查实际的 staged 和 unstaged 变更，并生成一条能准确描述改动的简洁英文 commit message。
5. 暂存当前任务需要的 tracked 和 untracked 文件。
6. 创建一个普通 git commit。
7. 推送到当前分支配置的上游远端。

要求：

- 在未检查实际变更前，不要凭空编造 commit message。
- 如果自动生成 commit message，必须使用英文。
- 生成的 message 应简洁且具体。
- 除非用户明确要求，否则不要 amend 已有 commit。
- 不要使用破坏性的 git 命令。
- 如果没有可提交的变更，要明确说明并停止。
- 如果 push 因未配置 upstream 失败，先为当前分支设置 upstream 再 push。
- 如果 push 因其他原因失败，报告真实失败原因。

输出要求：

- 说明最终使用的 commit message。
- 说明推送到了哪个 branch 和 remote。
- 如果没有 commit 或 push，解释原因。

示例：

- `/git-push --message "Add react skill guidance for dependency-driven rerenders"`
- `/git-push`