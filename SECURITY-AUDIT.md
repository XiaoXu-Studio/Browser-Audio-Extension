# 浏览器拉线助手 1.2.2 安全审核报告

最终本地复核日期：2026-10-29（America/New_York）。基准：1.2.1 / `7c9c4bd9cdb261bb79726e149b2ba7e5aed85996`。

## 结论与适用范围

本次确认的问题已在当前源码修复。插件本身没有运行时或开发 npm 依赖；两个独立发布工具的完整 npm audit（包括开发依赖）均为 0 条告警。OSV 对最终锁文件中 721 个不同 npm 名称/版本组合的查询没有返回匹配公告。本地维护的两个补丁包不依赖数据库识别，另行做了源码和专项测试验证。

**这不是“绝对安全”、商店批准或第三方平台审核通过的证明。** 审核没有确认插件运行代码中可直接利用的 Critical/High 漏洞，但不能保证没有遗漏或未来新漏洞。发布状态以 GitHub Actions 与 Release 实际结果为准，不能仅凭本报告认定已上线。

语言/架构：原生 JavaScript、HTML、CSS，Chromium Manifest V3；Node.js 构建测试。新增维护的发布工具使用 TypeScript、npm 锁文件、Jest/Vitest、ncc/esbuild。不涉及服务端数据库、上传接口、Electron/WebView、移动端或自定义加密。

范围：原项目全部 25 个跟踪文件、此次新增安全代码和发布配置、2 个维护的 Action 源码及测试、锁文件、实际打包输入、相关构建产物、历史插件 ZIP 和本地可达历史。第三方完整依赖树进行了公告扫描与关键路径审核，**没有逐行审计所有第三方包**。不包含旧桌面 EXE、Facebook/VoiceMeeter、浏览器本体、组织其他仓库或未拉取的历史对象。

## 问题汇总

严重程度为本场景评估；依赖项另标注公告评级，不能当作本项目已证实同级漏洞。

|编号|类别|严重级别|位置|状态|
|---|---|---|---|---|
|C01|代码/供应链|Medium|`.github/workflows/release.yml:22`|已修复：移除可变上游 Action 引用和旧 bundle，执行仓库内审查源码构建的工具|
|C02|代码/构建路径|Low|`scripts/package-safety.cjs:10`、`scripts/build.cjs:18`|已修复：拒绝父目录链接、junction、输出硬链接、非普通文件|
|C03|代码/归档清单|Low|`scripts/package-safety.cjs:45`、`scripts/verify-zip.cjs:13`|已修复：目录项/重复项/路径与完整文件白名单检查|
|C04|代码/网页诊断|Low|`page-status.js:15`、`:55`、`:76`|已修复：严格结构校验、标量投影、3 秒超时|
|D01|依赖|Critical/High（旧库公告）|旧 Action 锁文件；现 `release-tools/*/package-lock.json`|已修复：移除旧 checkout/setup-node 依赖链，升级并重建 attest/release 的实际依赖|
|D02|依赖|High（公告有争议）|`release-tools/http-cache-semantics/index.js:398`|已修复公告所述复用边界：本地防御性补丁；不是上游官方修复声明|
|D03|依赖|Low|`release-tools/deepmerge/index.js:48`|已修复：目标和源都过滤危险属性，包括 null-prototype 对象|
|D04|依赖|High（库级）|attest 锁文件 `node_modules/re2js`|已修复：2.8.6 → 2.9.1；只在 Markdown 开发工具链|
|D05|依赖/维护|Low|attest package/lock、ESLint 配置|已修复：替换停止维护的 ESLint 9、glob 10；恢复并验证 lint 配置|
|R01|代码/设计权限|Medium|`manifest.json:8`|建议关注：按全网站需求保留 HTTP/HTTPS 权限，不擅自缩减功能|
|R02|代码/信任边界|Low|`audio-hook.js`、`page-status.js:31`|建议关注：网页 MAIN 世界可伪造诊断，不是防篡改证明|
|R03|代码/CI 权限|Low|`.github/workflows/release.yml:16`|建议关注：单 job 内存在发布所需写权限，不等于进程级隔离|
|R04|治理配置|Medium|远程 main 分支配置|建议关注：复核时 main 未启用保护；审批/规则集须管理员按组织政策配置|

没有发现需从项目中移出的真实凭据。历史聊天中曾直接出现过 Token，必须在 GitHub 作废；不在报告中复制，也不使用该旧 Token。当前使用用户重新授权的 GitHub CLI 凭据库登录，发布工作流使用 GitHub 的临时 Token/OIDC，不写入个人 Token。

## 修复细节、利用条件与验证

### 构建与网页代码

- C01：上游可变标签或旧 bundle 被替换/存在漏洞时，发布可能执行不受本仓库锁文件控制的代码。现在检出精确提交、不持久化认证头；Node 官方归档先用固定 SHA-256 校验再解压；npm 安装全部禁止生命周期脚本。只执行两套本地 Action，构建后核对 webpack/esbuild 实际输入与安装树、锁文件，不把改锁文件当作修好了旧 bundle。
- C02：需要攻击者能预先布置本地工作区链接；原构建可能越界读取或覆盖目标。逐段 lstat 检查、预检全部输入和输出、限制文件大小，拒绝未知输出，不自动删除用户数据。测试确认外部 sentinel 不被改写；这不是同账号恶意并发修改的 OS 沙箱。
- C03：原验证忽略 ZIP 目录条目。现在只接受 14 个运行文件及所需 icons 目录，拒绝重复、路径穿越或额外目录；源文件与 ZIP 逐字节比较。原程序没有解压落盘，不把它描述为已经证实的 Zip Slip 写入漏洞。
- C04：网站可让缺字段结果误显成功，或让诊断 Promise 长期占住操作队列。现在校验计数/版本/布尔/错误白名单，仅接收有限标量，等待上限 3 秒。仍不能阻止网页自我死循环，也无法验证对方实际听到什么。
- 音频逻辑仅更新版本标识，没有改动 `remote-only`、关闭自动增益和降噪的设置；权限、图标和默认开启行为未变。

### 发布工具依赖与本地补丁

|依赖/问题|最终处理|适用性与证据|
|---|---|---|
|undici|运行 6.29.1；attest 测试 8.12.2|HTTPS 发布路径相关；公告包含 TLS 参数、恶意响应和 WS DoS 等，未证明外部访客可触发本项目全部路径。[公告示例](https://github.com/advisories/GHSA-xjj6-f33q-929c)|
|brace-expansion|2.1.7 / 5.0.12|当前 glob 为固定表达式，非访客输入；仍升级修补。[公告](https://github.com/advisories/GHSA-qhr7-859c-m2p7)|
|@sigstore/core|3.2.1|跨主版本修复；使用实际 DSSE 构建/签名/验签及 Unicode payload type 测试，并验证篡改拒绝。[公告](https://github.com/advisories/GHSA-jfc7-64v2-mr8c)|
|csv-parse、ip-address、smol-toml|7.0.3、10.7.4、1.9.1|完成升级及锁定；原公告/修复分支在历史依赖明细中保留，本次最终树重新扫描|
|http-cache-semantics|本地 `4.3.0-patch.1`|共享缓存的 max-stale 不能覆盖 private/no-store/no-cache/需重验证限制；6 个拒绝例与正常 public 命中通过。当前发布不是多租户缓存服务，未证实本项目泄露。[公告](https://github.com/advisories/GHSA-ch52-4w7c-c8xp)、[维护者争议](https://github.com/github/advisory-database/issues/10139)|
|deepmerge|本地 `4.3.1-patch.1`|Jest 工具链使用，过滤源与目标危险属性；正常数组、Symbol、merge.all 行为通过。上游未公布修复版。[公告](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)|
|re2js|2.9.1|新复扫命中 lookbehind 重复匹配 DoS，官方修复起点 2.8.7；仅 Markdown 开发检查，不进入两个运行 bundle。[公告](https://github.com/advisories/GHSA-gg6h-894w-4m9c)|
|ESLint / glob 维护终止|10.13.0 / 13.0.6|import-x 及 TS resolver 兼容 ESLint 10，glob 同步/异步/排除和 test-exclude 兼容测试通过；最终锁文件没有 deprecated 标记|

本地补丁使用明确的维护包名，不冒充上游。公共数据库不会识别这些名字，所以不能用 npm audit 的 0 条证明它们已修复；另行审核补丁、比对安装后的 index.js/package.json 与维护源码，并验证实际 bundle 引入缓存补丁。后续需要持续维护，不能自动移除 overrides。

两套工具上游来源、完整提交、许可证、构建步骤与具体改动见 [发布工具维护说明](release-tools/README.md)。没有恶意/仿冒包的已核实证据，但不能仅靠包名正常证明来源安全。

## 检查结果

|检查|结果|
|---|---|
|插件单元/构建/安全测试|51/51 通过|
|attest 原有测试|230/230；源码覆盖率 100%|
|release 原有测试|180/180；语句 95%、分支 91.08%，未降低阈值|
|专项安全与兼容测试|16/16，包括真实内存 DSSE 签名、缓存边界、对象合并、glob|
|类型检查 / 构建 / lint|两个工具类型检查与构建通过；attest ESLint/Markdown 通过|
|依赖树|npm ls 全树无 invalid/extraneous；完整 npm audit 三个项目均 0 条|
|OSV 交叉扫描|721 个不同名称/版本组合，无匹配；不包含两个本地包的自动识别|
|实际打包输入|attest 97 个包路径；release 23 个包路径，关键修复版本与安装树/锁文件一致|
|完整浏览器安装检查|Chrome for Testing 153.0.8010.12，21 项通过|
|敏感信息扫描|范围含源码/注释/文档/历史/ZIP；两处 test-pass 为上游 mock 数据，无已确认真实凭据|

浏览器测试使用隔离资料、假设备和网络拦截，覆盖同一资料两个标签页、跨来源 iframe、状态与开关跨重启、40 秒持续采集。没有重新实测 Facebook/VoiceMeeter 真实通话、十路通话、Brave 或数小时稳定性；音频处理未改动，但不能把旧用户反馈当作这些场景的新测试证据。

密钥扫描不输出命中值；`.env`、`.env.*`、私钥等忽略规则有效，未发现此类敏感文件被 Git 跟踪。没有业务密钥需求，故不制造空用途 `.env.example`。扫描的匹配规则和历史覆盖不是完整泄密检测保证。

## 逐类源码结论

- 无 SQL/NoSQL、反序列化服务、上传服务、数据库凭据或 WebView/IPC 入口。无远程代码下载、eval 执行业务输入、禁用 TLS 校验、自制弱加密。
- popup 动态内容为 textContent；无外部脚本、innerHTML 模板或远程配置执行。background 消息检查扩展 id、精确 popup 来源、消息类型及布尔值；无外部消息桥接，storage 访问限定可信上下文。
- MV3 权限仅 scripting/storage 和普通 HTTP/HTTPS host 权限；无 cookies/debugger/nativeMessaging/externally_connectable。默认 CSP 未放宽 unsafe-eval。
- 打包命令以参数数组调用程序，不拼接网页输入；发布只允许版本 tag push，不使用 pull_request_target。14 文件安装包不包含 npm 依赖、测试、凭据或发布工具。

## 剩余风险和后续决定

1. 用户已批准发布工具大版本升级、本地补丁维护和正式发布；没有待决定的插件功能删除或音频行为变更。
2. 全网站权限是现有产品需求，仍是敏感能力。保持少装扩展、只安装验证来源的包，不把状态文字当作安全认证。
3. main 保护、版本标签保护、独立审批和发布环境策略尚未配置，本报告不改变组织治理设置。建议由 owner 设置必要审核者和受保护规则；不可用“最高安全”措辞掩盖此限制。
4. 单 job 的发布写权限及 GitHub 托管 runner/上游服务信任仍存在。安装禁脚本、精确源码和全部门禁降低风险，但没有达到隔离构建签名或经过认证的某个 SLSA 等级。
5. 来源证明只证明指定工作流产生了指定文件，不是杀毒认证。未来每次发布必须重跑扫描/测试；新告警失败时停止，不静默忽略。公开分发是否恢复还受 GitHub 组织状态约束。
6. 本报告替代 2026-10-28 的阶段性结论；旧报告留作历史证据，其“暂不发布/等待上游”决定已被用户后续授权取代。
