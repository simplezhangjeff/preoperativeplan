# 术前规划系统 (Preoperative Planning System)

一个基于Web的术前规划系统，支持CT影像文件的上传、管理和下载。

## 功能特性

### 基础功能
- 📤 **文件上传**: 支持拖拽或点击上传CT文件
- 📁 **文件夹上传**: 直接上传整个DICOM文件夹（支持多文件序列）
- 📦 **ZIP上传**: 上传ZIP压缩包并自动解压
- 📥 **文件下载**: 快速下载已上传的CT文件
- 🗑️ **文件管理**: 查看和删除已上传的文件
- 📊 **进度显示**: 实时显示上传进度
- 🎨 **友好界面**: 现代化、响应式的用户界面
- 🔒 **文件验证**: 支持多种医学影像格式

### 高级功能（新增）
- 🔬 **DICOM 2D查看器**:
  - 基于Cornerstone.js的专业医学影像查看
  - 窗宽窗位调节
  - 图像缩放、平移、旋转
  - 图像反色功能
  - 实时显示DICOM元数据（患者信息、检查信息等）
  - 图像测量工具

- 🎯 **3D重建查看器**:
  - 基于Three.js和AMI.js的3D体积重建
  - 多平面重建(MPR)：轴位、矢状位、冠状位同时显示
  - 3D体积渲染
  - 预设窗口快速切换（骨窗、软组织、肺窗、脑窗）
  - 交互式旋转、缩放、平移
  - 不透明度和阈值调节

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
├── server.js              # 后端服务器
├── package.json           # 项目配置
├── public/               # 前端文件
│   ├── index.html        # 主页面
│   ├── viewer.html       # DICOM 2D查看器
│   ├── viewer3d.html     # 3D重建查看器
│   ├── styles.css        # 样式文件
│   ├── app.js            # 主页面逻辑
│   ├── viewer.js         # 2D查看器逻辑
│   └── viewer3d.js       # 3D查看器逻辑
├── uploads/              # 上传文件存储目录（自动创建）
└── README.md             # 项目说明
```

## API 接口

### 上传单个文件
- **POST** `/api/upload`
- 参数: `ctFile` (multipart/form-data)
- 响应: 上传成功的文件信息

### 上传文件夹
- **POST** `/api/upload-folder`
- 参数: `files[]` (multipart/form-data, 多文件), `folderName` (文件夹名称)
- 响应: 上传成功的文件夹信息

### 上传ZIP文件
- **POST** `/api/upload-zip`
- 参数: `zipFile` (multipart/form-data)
- 响应: 解压后的文件夹信息
- 说明: 自动解压ZIP并识别DICOM文件

### 获取文件列表
- **GET** `/api/files`
- 响应: 所有已上传文件和文件夹的列表

### 下载文件
- **GET** `/api/download/:filename`
- 参数: `filename` (路径参数)
- 响应: 文件下载

### 删除文件或文件夹
- **DELETE** `/api/delete/:filename`
- 参数: `filename` (路径参数)
- 响应: 删除结果
- 说明: 自动识别并删除文件或整个文件夹

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

### 前端基础
- 原生 HTML5
- CSS3 (现代化样式)
- JavaScript (ES6+)
- File System Access API (文件夹上传)
- Drag and Drop API (拖拽上传)

### 医学影像处理库
- **Cornerstone.js**: 2D医学影像显示和操作
- **Cornerstone Tools**: 医学影像交互工具
- **Cornerstone WADO Image Loader**: DICOM文件加载
- **DICOM Parser**: DICOM标准解析
- **Three.js**: 3D图形渲染
- **AMI.js**: 医学影像3D重建和MPR

### 文件处理
- **ADM-ZIP**: ZIP文件解压和处理

## 安全说明

- 文件类型验证
- 文件大小限制
- 文件名安全处理
- 建议在生产环境中添加身份验证

## 使用指南

### 上传和管理文件

#### 上传单个文件
1. 点击"单个文件"选项卡
2. 拖拽或点击上传区域选择DICOM文件
3. 等待上传完成

#### 上传DICOM文件夹
1. 点击"DICOM文件夹"选项卡
2. 点击上传区域或拖拽整个文件夹
3. 系统自动识别所有DICOM文件并上传
4. 查看文件列表中的序列信息（文件数量）

#### 上传ZIP压缩包
1. 点击"ZIP压缩包"选项卡
2. 上传包含DICOM文件的ZIP文件
3. 系统自动解压并识别DICOM文件
4. 查看解压后的序列

### 使用2D查看器
1. 点击文件列表中的"2D查看"按钮
2. 使用鼠标拖拽调整窗宽窗位
3. 点击工具栏切换不同工具：
   - **窗宽窗位**: 调整图像对比度和亮度
   - **平移**: 移动图像位置
   - **缩放**: 放大缩小图像
4. 使用侧边栏滑块精确调整参数

### 使用3D重建查看器
1. 点击文件列表中的"3D重建"按钮
2. 查看器显示四个视图：
   - **轴位**: 横断面视图
   - **矢状位**: 侧面视图
   - **冠状位**: 正面视图
   - **3D重建**: 三维体积渲染
3. 使用预设按钮快速切换常见窗口（骨窗、软组织等）
4. 拖拽鼠标旋转3D视图
5. 滚轮缩放，右键平移

## 后续开发计划

- [x] DICOM 文件在线预览
- [x] 3D 重建功能
- [x] DICOM文件夹直接上传
- [x] ZIP压缩包自动解压
- [x] 序列文件管理
- [ ] 用户认证和授权
- [ ] DICOM序列在查看器中切换切片
- [ ] 测量工具增强（距离、角度、面积）
- [ ] 注释和标记功能
- [ ] 影像报告生成
- [ ] 文件搜索和筛选
- [ ] 数据库集成
- [ ] AI辅助诊断集成

## 许可证

MIT License
