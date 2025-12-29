const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 确保上传目录存在
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置文件存储
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // 保留原始文件名并添加时间戳避免冲突
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const basename = path.basename(file.originalname, ext);
        cb(null, basename + '-' + uniqueSuffix + ext);
    }
});

// 文件过滤器 - 允许常见的医学影像格式
const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'application/dicom',
        'image/dicom',
        'application/octet-stream',
        'image/jpeg',
        'image/png',
        'image/tiff',
        'application/zip',
        'application/x-zip-compressed'
    ];

    const allowedExtensions = ['.dcm', '.dicom', '.nii', '.nii.gz', '.zip', '.jpg', '.jpeg', '.png', '.tiff', '.tif'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('不支持的文件类型。请上传 DICOM, NIfTI, 或图像文件。'));
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 500 * 1024 * 1024 // 限制文件大小为 500MB
    }
});

// API 路由

// 上传CT文件
app.post('/api/upload', upload.single('ctFile'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '没有上传文件' });
        }

        const fileInfo = {
            id: req.file.filename,
            originalName: req.file.originalname,
            filename: req.file.filename,
            size: req.file.size,
            uploadDate: new Date().toISOString(),
            path: req.file.path
        };

        // 保存文件元数据
        const metadataPath = path.join(uploadDir, req.file.filename + '.json');
        fs.writeFileSync(metadataPath, JSON.stringify(fileInfo, null, 2));

        res.json({
            success: true,
            message: '文件上传成功',
            file: {
                id: fileInfo.id,
                originalName: fileInfo.originalName,
                size: fileInfo.size,
                uploadDate: fileInfo.uploadDate
            }
        });
    } catch (error) {
        console.error('上传错误:', error);
        res.status(500).json({ error: '文件上传失败: ' + error.message });
    }
});

// 获取所有已上传的文件列表
app.get('/api/files', (req, res) => {
    try {
        const files = fs.readdirSync(uploadDir);
        const fileList = files
            .filter(f => f.endsWith('.json'))
            .map(f => {
                const content = fs.readFileSync(path.join(uploadDir, f), 'utf8');
                return JSON.parse(content);
            })
            .sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));

        res.json({ success: true, files: fileList });
    } catch (error) {
        console.error('获取文件列表错误:', error);
        res.status(500).json({ error: '获取文件列表失败' });
    }
});

// 下载文件
app.get('/api/download/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filepath = path.join(uploadDir, filename);

        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ error: '文件不存在' });
        }

        // 读取元数据获取原始文件名
        const metadataPath = filepath + '.json';
        let originalName = filename;
        if (fs.existsSync(metadataPath)) {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            originalName = metadata.originalName;
        }

        res.download(filepath, originalName);
    } catch (error) {
        console.error('下载错误:', error);
        res.status(500).json({ error: '文件下载失败' });
    }
});

// 删除文件
app.delete('/api/delete/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filepath = path.join(uploadDir, filename);
        const metadataPath = filepath + '.json';

        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ error: '文件不存在' });
        }

        // 删除文件和元数据
        fs.unlinkSync(filepath);
        if (fs.existsSync(metadataPath)) {
            fs.unlinkSync(metadataPath);
        }

        res.json({ success: true, message: '文件删除成功' });
    } catch (error) {
        console.error('删除错误:', error);
        res.status(500).json({ error: '文件删除失败' });
    }
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`术前规划服务器运行在 http://localhost:${PORT}`);
    console.log(`上传目录: ${uploadDir}`);
});
