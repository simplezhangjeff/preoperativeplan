const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');

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

// 上传DICOM文件夹
app.post('/api/upload-folder', upload.array('files', 1000), (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: '没有上传文件' });
        }

        const folderName = req.body.folderName || 'dicom-series';
        const timestamp = Date.now();
        const folderDir = path.join(uploadDir, `${folderName}-${timestamp}`);

        // 创建文件夹
        if (!fs.existsSync(folderDir)) {
            fs.mkdirSync(folderDir, { recursive: true });
        }

        // 移动所有文件到文件夹
        const fileInfos = req.files.map(file => {
            const newPath = path.join(folderDir, file.originalname);
            fs.renameSync(file.path, newPath);
            return {
                originalName: file.originalname,
                size: file.size,
                path: newPath
            };
        });

        // 计算总大小
        const totalSize = fileInfos.reduce((sum, f) => sum + f.size, 0);

        const folderInfo = {
            id: `${folderName}-${timestamp}`,
            originalName: folderName,
            filename: `${folderName}-${timestamp}`,
            isFolder: true,
            fileCount: req.files.length,
            size: totalSize,
            uploadDate: new Date().toISOString(),
            path: folderDir,
            files: fileInfos.map(f => f.originalName)
        };

        // 保存文件夹元数据
        const metadataPath = path.join(uploadDir, `${folderName}-${timestamp}.json`);
        fs.writeFileSync(metadataPath, JSON.stringify(folderInfo, null, 2));

        res.json({
            success: true,
            message: `文件夹上传成功 (${req.files.length} 个文件)`,
            folder: {
                id: folderInfo.id,
                originalName: folderInfo.originalName,
                fileCount: folderInfo.fileCount,
                size: folderInfo.size,
                uploadDate: folderInfo.uploadDate
            }
        });
    } catch (error) {
        console.error('上传文件夹错误:', error);
        res.status(500).json({ error: '文件夹上传失败: ' + error.message });
    }
});

// 上传ZIP文件并自动解压
app.post('/api/upload-zip', upload.single('zipFile'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '没有上传文件' });
        }

        const zipPath = req.file.path;
        const zipName = path.basename(req.file.originalname, '.zip');
        const timestamp = Date.now();
        const extractDir = path.join(uploadDir, `${zipName}-${timestamp}`);

        // 创建解压目录
        if (!fs.existsSync(extractDir)) {
            fs.mkdirSync(extractDir, { recursive: true });
        }

        // 解压ZIP文件
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(extractDir, true);

        // 删除ZIP文件
        fs.unlinkSync(zipPath);

        // 扫描解压后的文件
        const dicomFiles = [];
        let totalSize = 0;

        function scanDirectory(dir) {
            const files = fs.readdirSync(dir);
            files.forEach(file => {
                const filepath = path.join(dir, file);
                const stats = fs.statSync(filepath);

                if (stats.isDirectory()) {
                    scanDirectory(filepath);
                } else if (
                    file.endsWith('.dcm') ||
                    file.endsWith('.dicom') ||
                    file.endsWith('.nii') ||
                    file.endsWith('.nii.gz')
                ) {
                    dicomFiles.push({
                        name: file,
                        path: filepath,
                        size: stats.size
                    });
                    totalSize += stats.size;
                }
            });
        }

        scanDirectory(extractDir);

        if (dicomFiles.length === 0) {
            // 删除空文件夹
            fs.rmSync(extractDir, { recursive: true, force: true });
            return res.status(400).json({ error: 'ZIP文件中没有找到DICOM文件' });
        }

        const folderInfo = {
            id: `${zipName}-${timestamp}`,
            originalName: zipName,
            filename: `${zipName}-${timestamp}`,
            isFolder: true,
            fromZip: true,
            fileCount: dicomFiles.length,
            size: totalSize,
            uploadDate: new Date().toISOString(),
            path: extractDir,
            files: dicomFiles.map(f => f.name)
        };

        // 保存元数据
        const metadataPath = path.join(uploadDir, `${zipName}-${timestamp}.json`);
        fs.writeFileSync(metadataPath, JSON.stringify(folderInfo, null, 2));

        res.json({
            success: true,
            message: `ZIP解压成功 (${dicomFiles.length} 个DICOM文件)`,
            folder: {
                id: folderInfo.id,
                originalName: folderInfo.originalName,
                fileCount: folderInfo.fileCount,
                size: folderInfo.size,
                uploadDate: folderInfo.uploadDate
            }
        });
    } catch (error) {
        console.error('ZIP上传错误:', error);
        res.status(500).json({ error: 'ZIP文件处理失败: ' + error.message });
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

// 删除文件或文件夹
app.delete('/api/delete/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const metadataPath = path.join(uploadDir, filename + '.json');

        // 检查元数据文件是否存在
        if (!fs.existsSync(metadataPath)) {
            return res.status(404).json({ error: '文件不存在' });
        }

        // 读取元数据
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

        if (metadata.isFolder) {
            // 删除文件夹及其内容
            const folderPath = path.join(uploadDir, filename);
            if (fs.existsSync(folderPath)) {
                fs.rmSync(folderPath, { recursive: true, force: true });
            }
        } else {
            // 删除单个文件
            const filepath = path.join(uploadDir, filename);
            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
            }
        }

        // 删除元数据
        fs.unlinkSync(metadataPath);

        res.json({ success: true, message: metadata.isFolder ? '文件夹删除成功' : '文件删除成功' });
    } catch (error) {
        console.error('删除错误:', error);
        res.status(500).json({ error: '删除失败: ' + error.message });
    }
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`术前规划服务器运行在 http://localhost:${PORT}`);
    console.log(`上传目录: ${uploadDir}`);
});
