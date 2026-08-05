# 化妆部预约系统

面向主播、运营、化妆师、客服和管理员的统一预约与排班系统。主播、运营和化妆师使用响应式手机网页，客服和管理员使用电脑后台；所有角色共享同一套账号、权限、业务规则和排班数据。

当前项目已经完成全网页端迁移、正式名单导入、核心业务回归、十日业务仿真和单机 Docker 部署。微信小程序、微信登录、订阅消息及一次性绑定码不属于当前实现。

## 核心能力

- 账号密码登录、首次强制改密、多角色切换和场地数据隔离。
- 主播本人预约，运营代负责主播预约；每人每天最多两次。
- 现代妆 30 分钟、特殊妆 45 分钟、指导妆 15 分钟、仿妆 60 分钟。
- 固定预约申请、变更、取消、长期规则生成和单日临时调整。
- 化妆师班次、工作日、午休、加班、整日请假和临时不可排班。
- 化妆师请假审批及受影响主播、编号、时间、固定/单次类型快照。
- 今日、明日、未来七日和历史排班查询，支持筛选与 Excel 导出。
- 主播、化妆师、运营关系维护，人员删除、资格限制和账号管理。
- 操作记录、权限校验、数据库并发约束、自动任务、备份和回滚。

关键排班规则由服务端和 PostgreSQL 共同约束：预约使用 15 分钟刻度、只能操作明日起未来七日、目标日期 00:00 后锁定、同一化妆师不能重叠、同一主播不能重叠，档期冲突按事务提交顺序先到先得。

## 技术架构

| 层级       | 技术与职责                                          |
| ---------- | --------------------------------------------------- |
| 网页端     | React、TypeScript、Vite；统一手机端与电脑端界面     |
| API        | NestJS、Fastify；认证、权限、业务用例和事务边界     |
| 数据库     | PostgreSQL 18、Prisma、原生迁移；业务事实与并发约束 |
| 缓存与任务 | Redis、独立 Worker；缓存、限流、固定生成和导出任务  |
| 测试       | Vitest、Nest 测试、Playwright、数据库与并发检查脚本 |
| 部署       | Docker Compose、Nginx、HTTPS、健康检查和自动备份    |

项目采用模块化单体架构。PostgreSQL 是预约和排班的唯一事实来源，Redis 不参与最终冲突判定。

## 目录结构

| 目录                | 作用                                   |
| ------------------- | -------------------------------------- |
| `apps/admin-web`    | 五类角色共用的 React 响应式网页        |
| `apps/api`          | NestJS API、认证、权限和领域服务       |
| `apps/worker`       | 固定预约生成、状态推进和导出等后台任务 |
| `packages/database` | Prisma Schema、迁移和数据库客户端      |
| `packages/config`   | 共享 TypeScript 配置                   |
| `prisma`            | 数据模型、迁移和数据库专项检查         |
| `tests/e2e`         | Playwright 五角色端到端测试            |
| `scripts`           | 环境、导入、安全、容量和运维脚本       |
| `deploy`            | Nginx、HTTPS、备份及单机维护配置       |
| `docs`              | 产品、规则、架构、测试和运维文档       |

## 本地开发

### 环境要求

- Node.js 24 LTS
- pnpm 11
- Docker Desktop
- Chrome 或 Chromium

### 首次启动

```powershell
pnpm install
pnpm env:setup
pnpm infra:up
pnpm db:migrate
pnpm admin:bootstrap
pnpm dev:admin
```

`pnpm env:setup` 会创建本地开发所需的随机认证密钥；`pnpm admin:bootstrap` 会在终端中交互式创建首个管理员，密码不会通过命令参数传入。

默认地址：

- 网页端：`http://127.0.0.1:5173`
- API：`http://127.0.0.1:3000`
- OpenAPI：`http://127.0.0.1:3000/api-docs`

停止本地基础设施：

```powershell
pnpm infra:down
```

## 质量检查

```powershell
pnpm check
pnpm db:check
pnpm e2e:web-roles
pnpm test:simulation
pnpm test:capacity
pnpm security:check
```

`pnpm check` 依次执行格式检查、Lint、类型检查、单元测试和生产构建。涉及预约冲突、固定规则、请假或班次的修改，还应执行数据库专项检查和对应端到端测试。

## 数据导入

人员名单和主播—运营关系通过受控导入流程进入数据库。正式导入前必须先执行预检，无法精确匹配的关系留空，不允许按姓名猜测关联。

```powershell
pnpm data:preflight
pnpm data:import
```

文件格式、匹配规则和对账步骤见[现有数据盘点与导入规范](docs/现有数据盘点与导入规范.md)。真实人员名单、导出文件和导入结果不得提交到 Git。

## 部署与运维

第一期生产环境使用 Docker Compose 运行 PostgreSQL、Redis、API、Worker 和 Nginx 网关。数据库迁移前必须先完成并验证备份，生产配置、证书、密钥和备份均不得进入仓库。

- 通用部署：[部署与运维手册](docs/部署与运维手册.md)
- 4 核 4 GB 单机部署：[单机服务器部署手册](docs/单机服务器部署手册.md)
- 上线结论与风险：[上线评估与剩余风险](docs/上线评估与剩余风险.md)

## 文档入口

开发任务按以下顺序读取最少且充分的上下文：

1. [AGENTS.md](AGENTS.md)：开发质量、代码和 Git 规则。
2. [当前迭代](docs/当前迭代.md)：当前阶段和最近交付状态。
3. [文档索引](docs/README.md)：按任务定位权威文档。
4. [全网页端架构决策](docs/全网页端架构决策.md)：当前客户端、认证和部署边界。

根目录 README 只负责项目概览和导航。产品范围以[产品需求文档](docs/产品需求文档.md)为准，精确行为以[业务规则与状态流转](docs/业务规则与状态流转.md)为准，数据库执行事实以迁移和 Prisma Schema 为准。

## 安全说明

- 不提交 `.env`、生产密码、令牌、私钥、证书、数据库备份或真实人员名单。
- API 和数据库端口不得直接暴露到公网，生产入口必须使用 HTTPS。
- 管理员初始化、密码重置、人员删除和审批操作均需保留权限检查与操作记录。
- 提交前运行 `pnpm security:files`，发布前运行 `pnpm security:check`。
