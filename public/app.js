// API 基础路径
const API_BASE = window.location.origin;

// DOM 元素
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const folderInput = document.getElementById('folderInput');
const zipInput = document.getElementById('zipInput');
const uploadProgress = document.getElementById('uploadProgress');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const filesList = document.getElementById('filesList');
const refreshBtn = document.getElementById('refreshBtn');
const notification = document.getElementById('notification');

// 上传模式
let uploadMode = 'file'; // 'file', 'folder', 'zip'

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadFiles();
    setupEventListeners();
});

// 设置事件监听器
function setupEventListeners() {
    // 上传模式切换
    document.getElementById('fileUploadBtn').addEventListener('click', () => {
        setUploadMode('file');
    });

    document.getElementById('folderUploadBtn').addEventListener('click', () => {
        setUploadMode('folder');
    });

    document.getElementById('zipUploadBtn').addEventListener('click', () => {
        setUploadMode('zip');
    });

    // 点击上传区域选择文件
    dropZone.addEventListener('click', () => {
        if (uploadMode === 'folder') {
            folderInput.click();
        } else if (uploadMode === 'zip') {
            zipInput.click();
        } else {
            fileInput.click();
        }
    });

    // 单个文件选择
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
        e.target.value = '';
    });

    // 文件夹选择
    folderInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFolderUpload(e.target.files);
        }
        e.target.value = '';
    });

    // ZIP文件选择
    zipInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleZipUpload(e.target.files[0]);
        }
        e.target.value = '';
    });

    // 拖拽事件
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');

        const items = e.dataTransfer.items;
        if (items) {
            // 检查是否为文件夹
            for (let i = 0; i < items.length; i++) {
                const item = items[i].webkitGetAsEntry();
                if (item) {
                    if (item.isDirectory) {
                        // 读取文件夹内容
                        const files = await readDirectory(item);
                        if (files.length > 0) {
                            handleFolderUpload(files);
                        }
                        return;
                    }
                }
            }
        }

        // 处理单个文件
        if (e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.name.endsWith('.zip')) {
                handleZipUpload(file);
            } else {
                handleFileUpload(file);
            }
        }
    });

    // 刷新按钮
    refreshBtn.addEventListener('click', () => {
        loadFiles();
    });
}

// 设置上传模式
function setUploadMode(mode) {
    uploadMode = mode;

    // 更新按钮状态
    document.querySelectorAll('.upload-option-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    const dropText = document.getElementById('dropText');
    const fileTypes = document.getElementById('fileTypes');

    if (mode === 'file') {
        document.getElementById('fileUploadBtn').classList.add('active');
        dropText.textContent = '拖拽文件到此处或点击选择';
        fileTypes.textContent = '支持格式: DICOM (.dcm), NIfTI (.nii), 图像文件 (.jpg, .png)';
    } else if (mode === 'folder') {
        document.getElementById('folderUploadBtn').classList.add('active');
        dropText.textContent = '拖拽DICOM文件夹到此处或点击选择';
        fileTypes.textContent = '自动识别文件夹中的所有DICOM文件';
    } else if (mode === 'zip') {
        document.getElementById('zipUploadBtn').classList.add('active');
        dropText.textContent = '拖拽ZIP压缩包到此处或点击选择';
        fileTypes.textContent = '上传后自动解压并识别DICOM文件';
    }
}

// 读取文件夹内容
async function readDirectory(directory) {
    const files = [];

    async function readEntries(dirEntry, path = '') {
        const reader = dirEntry.createReader();

        return new Promise((resolve) => {
            const entries = [];

            function readBatch() {
                reader.readEntries(async (results) => {
                    if (results.length === 0) {
                        resolve(entries);
                    } else {
                        entries.push(...results);
                        readBatch();
                    }
                });
            }

            readBatch();
        });
    }

    async function processEntry(entry, path = '') {
        if (entry.isFile) {
            return new Promise((resolve) => {
                entry.file((file) => {
                    // 只添加DICOM相关文件
                    if (file.name.endsWith('.dcm') ||
                        file.name.endsWith('.dicom') ||
                        file.name.endsWith('.nii') ||
                        file.name.endsWith('.nii.gz')) {
                        files.push(file);
                    }
                    resolve();
                });
            });
        } else if (entry.isDirectory) {
            const entries = await readEntries(entry, path + entry.name + '/');
            for (const childEntry of entries) {
                await processEntry(childEntry, path + entry.name + '/');
            }
        }
    }

    await processEntry(directory);
    return files;
}

// 处理文件上传
async function handleFileUpload(file) {
    // 验证文件大小 (500MB)
    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
        showNotification('文件大小超过500MB限制', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('ctFile', file);

    try {
        // 显示进度条
        uploadProgress.style.display = 'block';
        progressFill.style.width = '0%';
        progressText.textContent = '上传中...';

        const xhr = new XMLHttpRequest();

        // 上传进度
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                progressFill.style.width = percentComplete + '%';
                progressText.textContent = `上传中... ${Math.round(percentComplete)}%`;
            }
        });

        // 上传完成
        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                const response = JSON.parse(xhr.responseText);
                showNotification('文件上传成功！', 'success');
                uploadProgress.style.display = 'none';
                fileInput.value = '';
                loadFiles();
            } else {
                const error = JSON.parse(xhr.responseText);
                showNotification('上传失败: ' + (error.error || '未知错误'), 'error');
                uploadProgress.style.display = 'none';
            }
        });

        // 上传错误
        xhr.addEventListener('error', () => {
            showNotification('上传失败: 网络错误', 'error');
            uploadProgress.style.display = 'none';
        });

        xhr.open('POST', `${API_BASE}/api/upload`);
        xhr.send(formData);

    } catch (error) {
        console.error('上传错误:', error);
        showNotification('上传失败: ' + error.message, 'error');
        uploadProgress.style.display = 'none';
    }
}

// 处理文件夹上传
async function handleFolderUpload(files) {
    if (!files || files.length === 0) {
        showNotification('文件夹为空或没有找到DICOM文件', 'error');
        return;
    }

    // 过滤出DICOM文件
    const dicomFiles = Array.from(files).filter(file =>
        file.name.endsWith('.dcm') ||
        file.name.endsWith('.dicom') ||
        file.name.endsWith('.nii') ||
        file.name.endsWith('.nii.gz')
    );

    if (dicomFiles.length === 0) {
        showNotification('文件夹中没有找到DICOM文件', 'error');
        return;
    }

    // 获取文件夹名称（从第一个文件的路径）
    let folderName = 'dicom-series';
    if (dicomFiles[0].webkitRelativePath) {
        const pathParts = dicomFiles[0].webkitRelativePath.split('/');
        folderName = pathParts[0] || 'dicom-series';
    }

    const formData = new FormData();
    formData.append('folderName', folderName);
    formData.append('isFolder', 'true');

    // 添加所有DICOM文件
    dicomFiles.forEach((file, index) => {
        formData.append('files', file);
    });

    try {
        // 显示进度条
        uploadProgress.style.display = 'block';
        progressFill.style.width = '0%';
        progressText.textContent = `上传文件夹中... (${dicomFiles.length} 个文件)`;

        const xhr = new XMLHttpRequest();

        // 上传进度
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                progressFill.style.width = percentComplete + '%';
                progressText.textContent = `上传中... ${Math.round(percentComplete)}% (${dicomFiles.length} 个文件)`;
            }
        });

        // 上传完成
        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                const response = JSON.parse(xhr.responseText);
                showNotification(`文件夹上传成功！(${dicomFiles.length} 个文件)`, 'success');
                uploadProgress.style.display = 'none';
                loadFiles();
            } else {
                const error = JSON.parse(xhr.responseText);
                showNotification('上传失败: ' + (error.error || '未知错误'), 'error');
                uploadProgress.style.display = 'none';
            }
        });

        // 上传错误
        xhr.addEventListener('error', () => {
            showNotification('上传失败: 网络错误', 'error');
            uploadProgress.style.display = 'none';
        });

        xhr.open('POST', `${API_BASE}/api/upload-folder`);
        xhr.send(formData);

    } catch (error) {
        console.error('上传错误:', error);
        showNotification('上传失败: ' + error.message, 'error');
        uploadProgress.style.display = 'none';
    }
}

// 处理ZIP文件上传
async function handleZipUpload(file) {
    if (!file.name.endsWith('.zip')) {
        showNotification('请选择ZIP文件', 'error');
        return;
    }

    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
        showNotification('ZIP文件大小超过500MB限制', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('zipFile', file);

    try {
        uploadProgress.style.display = 'block';
        progressFill.style.width = '0%';
        progressText.textContent = '上传ZIP文件...';

        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                progressFill.style.width = percentComplete + '%';
                progressText.textContent = `上传中... ${Math.round(percentComplete)}%`;
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                const response = JSON.parse(xhr.responseText);
                showNotification('ZIP文件上传并解压成功！', 'success');
                uploadProgress.style.display = 'none';
                loadFiles();
            } else {
                const error = JSON.parse(xhr.responseText);
                showNotification('上传失败: ' + (error.error || '未知错误'), 'error');
                uploadProgress.style.display = 'none';
            }
        });

        xhr.addEventListener('error', () => {
            showNotification('上传失败: 网络错误', 'error');
            uploadProgress.style.display = 'none';
        });

        xhr.open('POST', `${API_BASE}/api/upload-zip`);
        xhr.send(formData);

    } catch (error) {
        console.error('上传错误:', error);
        showNotification('上传失败: ' + error.message, 'error');
        uploadProgress.style.display = 'none';
    }
}

// 加载文件列表
async function loadFiles() {
    try {
        filesList.innerHTML = '<div class="loading">加载中...</div>';

        const response = await fetch(`${API_BASE}/api/files`);
        const data = await response.json();

        if (data.success && data.files.length > 0) {
            displayFiles(data.files);
        } else {
            filesList.innerHTML = '<div class="empty-state">暂无上传文件</div>';
        }
    } catch (error) {
        console.error('加载文件列表错误:', error);
        filesList.innerHTML = '<div class="empty-state">加载失败，请重试</div>';
    }
}

// 显示文件列表
function displayFiles(files) {
    filesList.innerHTML = files.map(file => {
        const isFolder = file.isFolder === true;
        const icon = isFolder ? '📁' : getFileExtension(file.originalName);
        const fileCount = isFolder ? ` (${file.fileCount} 个文件)` : '';

        return `
        <div class="file-item ${isFolder ? 'folder-item' : ''}">
            <div class="file-icon ${isFolder ? 'folder-icon' : ''}">${icon}</div>
            <div class="file-info">
                <div class="file-name">
                    ${escapeHtml(file.originalName)}${fileCount}
                    ${file.fromZip ? '<span class="badge">ZIP解压</span>' : ''}
                </div>
                <div class="file-meta">
                    <span>大小: ${formatFileSize(file.size)}</span>
                    <span>上传时间: ${formatDate(file.uploadDate)}</span>
                </div>
            </div>
            <div class="file-actions">
                ${isFolder || isDicomFile(file.originalName) ? `
                    <button class="btn btn-view" onclick="viewFile('${file.filename}', '${escapeHtml(file.originalName)}', ${isFolder})">
                        ${isFolder ? '序列查看' : '2D查看'}
                    </button>
                    <button class="btn btn-view3d" onclick="view3DFile('${file.filename}', '${escapeHtml(file.originalName)}', ${isFolder})">
                        3D重建
                    </button>
                ` : ''}
                <button class="btn btn-download" onclick="downloadFile('${file.filename}', '${escapeHtml(file.originalName)}')">
                    下载
                </button>
                <button class="btn btn-delete" onclick="deleteFile('${file.filename}', '${escapeHtml(file.originalName)}', ${isFolder})">
                    删除
                </button>
            </div>
        </div>
        `;
    }).join('');
}

// 下载文件
function downloadFile(filename, originalName) {
    window.location.href = `${API_BASE}/api/download/${filename}`;
    showNotification(`正在下载: ${originalName}`, 'info');
}

// 删除文件
async function deleteFile(filename, originalName, isFolder = false) {
    const confirmMsg = isFolder
        ? `确定要删除文件夹 "${originalName}" 及其所有内容吗？`
        : `确定要删除文件 "${originalName}" 吗？`;

    if (!confirm(confirmMsg)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/delete/${filename}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            showNotification(isFolder ? '文件夹删除成功' : '文件删除成功', 'success');
            loadFiles();
        } else {
            showNotification('删除失败: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('删除错误:', error);
        showNotification('删除失败: ' + error.message, 'error');
    }
}

// 显示通知
function showNotification(message, type = 'info') {
    notification.textContent = message;
    notification.className = `notification ${type} show`;

    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// 格式化日期
function formatDate(dateString) {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// 获取文件扩展名
function getFileExtension(filename) {
    const ext = filename.split('.').pop().toUpperCase();
    if (ext.length > 4) return 'FILE';
    return ext;
}

// HTML转义
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// 判断是否为DICOM文件
function isDicomFile(filename) {
    const ext = filename.toLowerCase();
    return ext.endsWith('.dcm') ||
           ext.endsWith('.dicom') ||
           ext.endsWith('.nii') ||
           ext.endsWith('.nii.gz');
}

// 2D查看文件
function viewFile(filename, originalName, isFolder = false) {
    const url = `viewer.html?file=${encodeURIComponent(filename)}&folder=${isFolder}`;
    window.open(url, '_blank');
}

// 3D查看文件
function view3DFile(filename, originalName, isFolder = false) {
    const url = `viewer3d.html?file=${encodeURIComponent(filename)}&folder=${isFolder}`;
    window.open(url, '_blank');
}
