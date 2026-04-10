# 流浪宠物救助系统代码雏形

## 项目说明
这是一个用于毕业设计的最小可运行代码骨架，技术栈为：
- 后端：Spring Boot 3 + MySQL
- 前端：Vue 3 + Vite + Vue Router + Axios

## 目录结构
- `backend/`：后端服务
- `frontend/`：前端页面

## 一期核心模块
- 用户登录
- 流浪动物列表/新增
- 救助站列表
- 领养申请提交

## 启动说明

### 后端
1. 安装 JDK 17、Maven、MySQL 8
2. 创建数据库：`stray_rescue`
3. 修改 `backend/src/main/resources/application.yml`
4. 运行：
   - `cd backend`
   - `mvn spring-boot:run`

### 前端
1. 安装 Node.js 18+
2. 运行：
   - `cd frontend`
   - `npm install`
   - `npm run dev`

## 后续建议
- 增加 JWT 登录鉴权
- 增加后台管理页面
- 增加图片上传
- 增加领养审核流转
