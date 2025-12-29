# 术前规划系统 (Preoperative Planning System)

一个基于Web的术前规划系统，支持CT影像文件的上传、管理和下载。

## 功能特性

- 📤 **文件上传**: 支持拖拽或点击上传CT文件
- 📥 **文件下载**: 快速下载已上传的CT文件
- 🗑️ **文件管理**: 查看和删除已上传的文件
- 📊 **进度显示**: 实时显示上传进度
- 🎨 **友好界面**: 现代化、响应式的用户界面
- 🔒 **文件验证**: 支持多种医学影像格式

## 支持的文件格式

- DICOM 文件 (`.dcm`, `.dicom`)
- NIfTI 文件 (`.nii`, `.nii.gz`)
- 图像文件 (`.jpg`, `.jpeg`, `.png`, `.tiff`, `.tif`)
- 压缩文件 (`.zip`)

## 安装与运行

### 前置要求

- Node.js (v14 或更高版本)
- npm 或 yarn

### 安装步骤

1. 克隆项目
```bash
git clone <repository-url>
cd preoperativeplan
```

2. 安装依赖
```bash
npm install
```

3. 启动服务器
```bash
npm start
```

或者使用开发模式（自动重启）：
```bash
npm run dev
```

4. 打开浏览器访问
```
http://localhost:3000
```

## 项目结构

```
preoperativeplan/
├── server.js           # 后端服务器
├── package.json        # 项目配置
├── public/            # 前端文件
│   ├── index.html     # 主页面
│   ├── styles.css     # 样式文件
│   └── app.js         # 前端逻辑
├── uploads/           # 上传文件存储目录（自动创建）
└── README.md          # 项目说明
```

## API 接口

### 上传文件
- **POST** `/api/upload`
- 参数: `ctFile` (multipart/form-data)
- 响应: 上传成功的文件信息

### 获取文件列表
- **GET** `/api/files`
- 响应: 所有已上传文件的列表

### 下载文件
- **GET** `/api/download/:filename`
- 参数: `filename` (路径参数)
- 响应: 文件下载

### 删除文件
- **DELETE** `/api/delete/:filename`
- 参数: `filename` (路径参数)
- 响应: 删除结果

## 配置

### 端口设置
默认端口为 3000，可通过环境变量修改：
```bash
PORT=8080 npm start
```

### 文件大小限制
当前限制为 500MB，可在 `server.js` 中修改：
```javascript
limits: {
    fileSize: 500 * 1024 * 1024 // 500MB
}
```

## 技术栈

### 后端
- Node.js
- Express.js
- Multer (文件上传处理)
- CORS (跨域支持)

### 前端
- 原生 HTML5
- CSS3 (现代化样式)
- JavaScript (ES6+)

## 安全说明

- 文件类型验证
- 文件大小限制
- 文件名安全处理
- 建议在生产环境中添加身份验证

## 后续开发计划

- [ ] 用户认证和授权
- [ ] DICOM 文件在线预览
- [ ] 3D 重建功能
- [ ] 多文件批量上传
- [ ] 文件搜索和筛选
- [ ] 数据库集成

## 许可证

MIT License
