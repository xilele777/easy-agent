# DeepSeek 真实模型 Windows 工作流核验

> 核验日期：2026-09-27；起点提交：`3abd6df`；本次代码与文档改动尚在工作区，未推送远端。

用户级 `~/.easy-agent/settings.json` 已增加 `deepseek` Profile：`openai-chat` 协议、`https://api.deepseek.com`、`deepseek-flash`，并设为默认。API Key 继续引用用户已有的 `${OPENAI_API_KEY}` 环境变量；配置文件、仓库与本文均不保存密钥值。DeepSeek `/models` 返回 `deepseek-flash`，CLI 的 `--print` 简短请求返回“连接成功”，退出码为 `0`。

在 Windows PowerShell、Node.js `v24.14.0` 下，创建仅含 `example.txt`（`ALPHA\n`）的临时 Git 仓库，用 `node dist/eagent.js --model deepseek` 启动真实交互会话。已依次观察到：

1. 确认临时仓库可信后进入 `/mode plan`；真实模型搜索到 `example.txt:1:ALPHA`，生成将其改为 `BETA` 的计划。此时文件仍是 `ALPHA`，`git diff --exit-code` 返回 `0`。
2. 在退出计划的选项中选择“manually approve edits”。模型提出 `Edit` 的 `ALPHA → BETA` 差异，界面显示逐次写入授权；只允许本次编辑。随后文件是 `BETA`，Git 仅显示 `example.txt` 的单行差异。
3. `/diff` 显示 `1 file changed, +1 -1`。执行 `/rewind` 后，界面报告恢复了 `example.txt`；再次 `/diff` 显示 `clean — no uncommitted changes`，文件内容恢复为 `ALPHA`，`git diff --exit-code` 返回 `0`。
4. 正常退出交互进程，退出码为 `0`。全过程未在临时仓库写入密钥。

这补齐了[离线工作流记录](./0003-2026-09-27-改造-离线工作流回归与Windows演示.md)之外的真实模型证据。模型在探索时尝试过 Bash，WSL 启动返回 `E_ACCESSDENIED`；之后使用可用的搜索、读取和 PowerShell 路径完成流程。该观察只说明本机该次 Bash 调用失败，不影响上述 Windows 工作流结论。[复现步骤](../../docs/windows-workflow.md)已改用本次验证的 Profile 示例。

本次没有 macOS 验证，也没有运行修改后的远端 CI。完整跨平台门禁仍待同一提交上的 CI 结果；宿主沙箱隔离不在本次核验范围内。
