# 化妆部预约系统

用于替代现有 Excel 人工排班流程，从预约源头生成结构化、无冲突、可追溯的化妆排班。

当前阶段：**M1 工程与环境基线**。交互原型和正式设计文档已经完成，正式工程骨架已初始化；当前代码只包含可构建、可测试的技术基线，不包含预约业务功能。

## 快速入口

- [开发入口](docs/开发入口.md)：每次开发任务从这里开始，只读取当前任务需要的文档。
- [当前迭代](docs/当前迭代.md)：当前目标、进度、待确认事项和下一任务。
- [文档索引](docs/README.md)：九份权威文档的职责、读取场景和冲突处理方式。
- [项目协作规范](AGENTS.md)：代码质量、业务依据、测试和 Git 规则。
- [交互原型说明](prototype/README.md)：原型范围和本地运行方式。
- [私有交互原型](https://zhuangxu-makeup-booking.kusento173.chatgpt.site)：模拟数据，不连接真实名单、数据库或微信通知。

## 目录

```text
化妆部预约系统/
├─ README.md             # 项目总入口
├─ AGENTS.md             # 开发与协作硬性规范
├─ apps/
│  ├─ api/               # NestJS API
│  ├─ worker/            # NestJS 后台任务进程
│  ├─ admin-web/         # React 管理后台
│  └─ miniapp/           # Taro＋React 微信小程序
├─ packages/
│  └─ config/            # 共享 TypeScript 配置
├─ docs/                 # 权威产品、业务和技术文档
├─ prototype/            # 可点击交互原型
└─ data/
   ├─ README.md          # 本地数据安全说明
   └─ source/            # 真实 Excel 源文件，Git 忽略
```

第一期采用 TypeScript 全栈、微信小程序与 Web 管理后台、NestJS 模块化单体、PostgreSQL、Redis/BullMQ 和 Docker Compose。共享包、数据库和测试目录在真正有实现时再建立，不保留无意义的空目录。

## 本地工程

要求：Node.js 24 LTS、pnpm 11、Docker Desktop。微信开发者工具在小程序联调任务前安装。

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env
pnpm infra:up
pnpm db:migrate
pnpm infra:check
pnpm check
```

`infra:up` 会启动 PostgreSQL 18.4 和 Redis 8.8.0 并等待健康检查通过；`db:migrate` 会执行所有尚未应用的 Prisma 迁移；`infra:check` 会验证数据库连接、已安装的 `btree_gist` 扩展和 Redis 密码认证。常用数据库与基础设施命令：

```powershell
pnpm db:validate
pnpm db:status
pnpm infra:status
pnpm infra:logs
pnpm infra:down
```

`infra:down` 只停止并移除容器，保留数据库命名卷。项目不提供自动删除数据卷的快捷命令，避免误删本地数据。

`pnpm check` 会依次校验格式、Lint、TypeScript、单元测试和四个应用的生产构建。开发单个应用时使用：

```powershell
pnpm --filter @makeup/api dev
pnpm --filter @makeup/worker dev
pnpm --filter @makeup/admin-web dev
pnpm --filter @makeup/miniapp dev
```

提交前运行 `pnpm security:check`，检查 Git 已跟踪文件中是否混入人员表、环境配置、密钥、备份或导出文件，并阻止生产依赖中的高危和严重漏洞。`pnpm security:audit:all` 用于查看包含构建工具在内的完整依赖审计；该命令可能因 Taro 上游尚无可用修复版本而失败，不能通过忽略规则或未经验证的跨主版本覆盖强行消除结果。

GitHub Actions 会在每次推送和拉取请求中，从空数据库执行迁移并运行同一套项目检查；工作流定义见 [`.github/workflows/ci.yml`](.github/workflows/ci.yml)。

首次启动前复制 `.env.example` 为本地 `.env`，需要时再修改本机端口和开发密码；`.env`、真实人员文件、构建产物和本地微信项目配置均不会进入 Git。PostgreSQL 和 Redis 端口只绑定到 `127.0.0.1`，不会暴露给局域网。

## 文档使用原则

1. 不要在每个任务中通读全部文档。
2. 先看[当前迭代](docs/当前迭代.md)，再按[文档索引](docs/README.md)读取当前模块的权威文档。
3. 同一事实只在对应权威文档中维护，其他文档只引用，不复制。
4. 文档与代码冲突时，先统一权威文档和测试，再修改实现。
5. 每个完整变更通过检查后创建一次 Git 提交。

## 下一步

按[当前迭代](docs/当前迭代.md)继续完成 M1 的本地提交和端到端冒烟门禁，再进入主数据和身份权限开发。
