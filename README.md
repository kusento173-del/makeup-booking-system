# 化妆部预约系统

面向主播、运营、化妆师、客服和管理员的统一网页预约与排班系统。

- 主播、运营、化妆师：使用响应式手机网页。
- 客服、管理员：使用电脑网页。
- 所有业务共享同一套 API、权限、业务规则和数据库。
- 微信小程序、Taro、微信登录和一次性绑定码已经移除。

## 项目组成

| 目录                | 作用                                         |
| ------------------- | -------------------------------------------- |
| `apps/admin-web`    | React 网页端，包含手机业务界面和电脑管理后台 |
| `apps/api`          | NestJS API、认证、权限和领域服务             |
| `apps/worker`       | 固定预约生成、状态推进等后台任务             |
| `packages/database` | Prisma Schema、迁移和数据库客户端            |
| `packages/config`   | 共享 TypeScript 配置                         |
| `tests/e2e`         | Playwright 端到端测试                        |
| `scripts`           | 环境、数据库、安全和运维检查                 |
| `docs`              | 产品、规则、架构、测试和运维文档             |

## 本地启动

要求：Node.js 24 LTS、pnpm 11、Docker Desktop 和 Chrome。

```powershell
pnpm install
pnpm infra:up
pnpm db:migrate
pnpm dev:admin
```

默认访问地址：

- 网页端：`http://127.0.0.1:5173`
- API：`http://127.0.0.1:3000`

首次创建管理员：

```powershell
pnpm admin:bootstrap
```

该命令会在终端中安全地交互式读取登录名和密码。

## 常用检查

```powershell
pnpm check
pnpm e2e
pnpm db:check
pnpm security:check
```

`pnpm check` 包含格式、Lint、类型、测试和生产构建。代码提交前至少运行与改动风险相匹配的检查。

## 文档入口

开发任务先阅读：

1. [AGENTS.md](AGENTS.md)
2. [当前迭代](docs/当前迭代.md)
3. [文档索引](docs/README.md)

全网页端迁移的当前事实见[全网页端架构决策](docs/全网页端架构决策.md)。旧文档中仍保留的“小程序、Taro、微信登录、绑定码”等文字只用于历史追溯，不代表当前实现。
