# Windows 工作流复现

本例在临时仓库中检查搜索、只读计划、权限确认、文件差异和回滚。需要 Windows PowerShell、Git、可用的 `eagent` 命令，以及已在用户目录配置的模型 Profile。模型调用会使用对应服务；请勿把 API Key 写进示例仓库或录屏。

## 准备隔离仓库

在 PowerShell 中运行：

```powershell
$demoDir = Join-Path $env:TEMP ("easy-agent-demo-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $demoDir | Out-Null
[System.IO.File]::WriteAllText((Join-Path $demoDir "example.txt"), "ALPHA`n")
git -C $demoDir init -q
git -C $demoDir add example.txt
git -C $demoDir -c user.name=Demo -c user.email=demo@example.invalid commit -qm baseline
Set-Location $demoDir
eagent --model deepseek
```

将 `deepseek` 换成已配置的 Profile 名称。首次进入临时仓库时，按实际提示确认项目信任；示例仓库不包含项目级设置或密钥。

## 逐步演示

1. 在 Easy Agent 中执行 `/mode plan`，再输入：`搜索 example.txt 中的 ALPHA，给出将它改为 BETA 的计划，暂时不要修改文件。` 此时文件应仍为 `ALPHA`。
2. 执行 `/mode default`，再输入：`只把 example.txt 中的 ALPHA 改为 BETA。修改前请等待我的权限确认。` 出现写入权限提示时，仅对该操作选择一次性允许。
3. 执行 `/diff`，确认仅 `example.txt` 有预期差异。执行 `/rewind` 后，再次执行 `/diff`，应无未提交文件差异。
4. 退出程序后，在 PowerShell 中核对：

```powershell
Get-Content (Join-Path $demoDir "example.txt")
git -C $demoDir diff --exit-code
```

预期文件内容恢复为 `ALPHA`，`git diff --exit-code` 返回 `0`。保留脱敏的权限提示、改动前后差异和回滚结果，作为真实模型验证证据。Windows PowerShell 可运行不表示已有宿主沙箱隔离；边界见[沙箱说明](./sandbox-security.md)。

## 无模型凭证时的离线回归

在项目仓库运行 `npm run test:workflow-offline`。该用例使用本地模型响应夹具和临时 Git 仓库，验证工具结果回填、Plan Mode 拒绝写入、默认模式请求权限、`/diff` 和 `/rewind`；它不替代上述真实模型交互演示。
