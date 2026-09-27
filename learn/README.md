# Easy Agent 项目资料与演进记录

> 初始调研基线：仓库 `eagent@0.1.1`，提交 `56c2cdc`。本目录还保存后续改造、缺陷、计划、交接等项目记录；每次改造新增文档，既有记录保留其形成时的结论。

想快速了解每天做了什么，先看[工作日志](./WORKLOG.md)。当前改造进度见[真实模型基准试跑后进度](./handoff/0003-2026-09-27-交接-真实模型基准试跑后进度.md)，具体下一步见[扩大真实模型基准计划](./plans/0003-2026-09-27-规划-扩大Windows真实模型基准与失败分析.md)。

## 文档分类

| 类型 | 收录内容 | 当前文档 |
| --- | --- | --- |
| `reference/` | 长期有效的架构与调用链资料 | [架构总览](./reference/0000-2026-09-26-参考-架构总览.md)、[核心调用链](./reference/0001-2026-09-26-参考-核心调用链.md) |
| `reviews/` | 当前版本的质量评审与调研结论 | [质量与风险评估](./reviews/0000-2026-09-26-评审-质量与风险评估.md)、[跨平台 CI 门禁核验](./reviews/0001-2026-09-27-评审-跨平台CI门禁核验.md)、[真实模型基准试跑结果](./reviews/0002-2026-09-27-评审-Windows真实模型基准试跑结果.md)、[独立仓库迁移与贡献图条件](./reviews/0003-2026-09-27-评审-独立仓库迁移与贡献图条件.md) |
| `bugs/` | 单个问题的复现、原因、影响与验收条件 | [Windows 下 Grep 搜索失败](./bugs/0000-2026-09-26-缺陷-Windows下Grep搜索失败.md) |
| `plans/` | 待实施的优化计划与拓展方向 | [优化与拓展路线](./plans/0000-2026-09-26-规划-优化与拓展路线.md)、[扩大 Windows 真实模型基准与失败分析](./plans/0003-2026-09-27-规划-扩大Windows真实模型基准与失败分析.md) |
| `changes/` | 每次项目改造的新记录 | [文档目录与记录约束](./changes/0000-2026-09-27-改造-文档目录与记录约束.md)、[Windows 第一阶段进度核验](./changes/0001-2026-09-27-改造-Windows可移植性第一阶段进度核验.md)、[跨平台门禁与 PowerShell 取消回归](./changes/0002-2026-09-27-改造-跨平台门禁与PowerShell取消回归.md)、[离线工作流与 Windows 演示](./changes/0003-2026-09-27-改造-离线工作流回归与Windows演示.md)、[DeepSeek 真实模型核验](./changes/0004-2026-09-27-改造-DeepSeek真实模型Windows工作流核验.md)、[拆分提交约束](./changes/0005-2026-09-27-改造-按工作单元拆分提交约束.md)、[阶段收口与计划归档](./changes/0006-2026-09-27-改造-阶段收口与计划归档.md)、[真实模型基准夹具](./changes/0007-2026-09-27-改造-Windows真实模型基准夹具.md)、[基准试跑收口](./changes/0008-2026-09-27-改造-基准试跑收口与计划归档.md)、[计划续接与工作日志](./changes/0009-2026-09-27-改造-计划续接与工作日志.md)、[Windows 优先 CI 与文档跳过规则](./changes/0010-2026-09-27-改造-Windows优先CI与文档跳过规则.md) |
| `handoff/` | 阶段交接与状态快照 | [下一阶段执行进度](./handoff/0000-2026-09-27-交接-下一阶段执行进度.md)、[DeepSeek 实测后阶段进度](./handoff/0001-2026-09-27-交接-DeepSeek实测后阶段进度.md)、[Windows 优先主线阶段收口](./handoff/0002-2026-09-27-交接-Windows优先主线阶段收口.md)、[真实模型基准试跑后进度](./handoff/0003-2026-09-27-交接-真实模型基准试跑后进度.md) |
| `resume/` | 简历项目的贡献、指标与展示材料 | 暂无 |
| `archive/plans/` | 已完成或废弃的历史计划 | [Windows 优先主线下一阶段](./archive/plans/0001-2026-09-27-规划-Windows优先主线下一阶段.md)、[Windows 真实模型基准试跑](./archive/plans/0002-2026-09-27-规划-Windows真实模型基准试跑.md) |

目录按**文档用途**命名。新增或移动文档时按根目录的[项目文档目录约束](../AGENTS.md)选择位置和文件名；本目录的 `README.md` 是索引，`WORKLOG.md` 是工作日志，都不套用编号。阅读时可先看 `WORKLOG.md`，再按需要查 `reference/`、`reviews/`、`bugs/`、`plans/` 和 `changes/`。

官方材料可与这些调研文档对照阅读：[中文 README](../README.zh-CN.md)、[项目维护提示](../AGENT.md)、[测试说明](../docs/testing.md)、[安全文档索引](../docs/configuration-security.md)。

## 本地跑起来（PowerShell）

要求 Node.js 22+。`step/` 是教学快照，`src/` 是运行时代码，`dist/` 是构建产物。

```powershell
npm ci
npm run typecheck
npm run build
npm run dev -- --help
```

使用 GPT 时，除了在当前终端设置 `OPENAI_API_KEY`，还需要在用户级 `$HOME\.easy-agent\settings.json` 中声明 `models` Profile；字段示例见[中文 README 的“模型配置”](../README.zh-CN.md#模型配置)。用户级配置更适合个人学习；仓库级 `.easy-agent/` 和 `.env` 受项目可信状态控制。不要把真实 Key 写入本目录或提交到 Git。

无模型凭证也能学习大部分代码、运行离线检查。`npm run verify:production` 会依次类型检查、打包并运行 core、extensions、ui 测试；当前 Windows 环境的已知结果记录在[质量与风险评估](./reviews/0000-2026-09-26-评审-质量与风险评估.md)。`live` 测试需要真实凭证，会产生 API 调用费用，默认门禁不运行它们。

## 建议的阅读节奏

1. **半天理解最小闭环**：先读 `step/step4.js`，再读 `src/core/agenticLoop.ts` 中的 `query` 与 `runTools`。用纸画出“用户消息 → 模型 → tool_use → tool_result → 模型”的循环。
2. **半天理解外围**：对照 `src/entrypoint/cli.ts`、`src/entrypoint/headless.ts` 与 `src/ui/hooks/useAgentSession.ts`，找出同一个 `QueryEngine` 的两个消费者。
3. **一天理解一个工具**：选 `Read` 或 `Grep`，沿工具注册、权限判断、路径检查、结果回填走一遍。
4. **一天理解持久化和扩展**：阅读 `src/session/storage.ts`、`src/services/mcp/bootstrap.ts`、`src/services/skills/bootstrap.ts`，回答“重启后保留什么，何时新工具会进入模型可见列表”。
5. **动手理解一个小修复**：从[Windows 下 Grep 搜索失败](./bugs/0000-2026-09-26-缺陷-Windows下Grep搜索失败.md)的复现与修复入手，了解工具层与验证链路。

## 调研原则

- 文档中的“已实现”表示代码或仓库文档可定位；“已验证”才表示在本机运行过相应检查。
- 本机失败不等于所有平台失败。先区分产品行为、测试脚本假设和外部命令缺失。
- 改功能时按[测试说明](../docs/testing.md)挑相关测试；不要把需要真实模型或宿主沙箱的测试误当成默认离线测试。
- 该项目采用 [MIT License](../LICENSE)。二次开发与简历描述应保留原作者信息，并明确你自己的改动范围。
