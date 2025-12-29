// API 基础路径
const API_BASE = window.location.origin;

// DOM 元素
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const uploadProgress = document.getElementById('uploadProgress');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const filesList = document.getElementById('filesList');
const refreshBtn = document.getElementById('refreshBtn');
const notification = document.getElementById('notification');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadFiles();
    setupEventListeners();
});

// 设置事件监听器
function setupEventListeners() {
    // 点击上传区域选择文件
    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    // 文件选择
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });

    // 拖拽事件
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');

        if (e.dataTransfer.files.length > 0) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    });

    // 刷新按钮
    refreshBtn.addEventListener('click', () => {
        loadFiles();
    });
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
    filesList.innerHTML = files.map(file => `
        <div class="file-item">
            <div class="file-icon">${getFileExtension(file.originalName)}</div>
            <div class="file-info">
                <div class="file-name">${escapeHtml(file.originalName)}</div>
                <div class="file-meta">
                    <span>大小: ${formatFileSize(file.size)}</span>
                    <span>上传时间: ${formatDate(file.uploadDate)}</span>
                </div>
            </div>
            <div class="file-actions">
                ${isDicomFile(file.originalName) ? `
                    <button class="btn btn-view" onclick="viewFile('${file.filename}', '${escapeHtml(file.originalName)}')">
                        2D查看
                    </button>
                    <button class="btn btn-view3d" onclick="view3DFile('${file.filename}', '${escapeHtml(file.originalName)}')">
                        3D重建
                    </button>
                ` : ''}
                <button class="btn btn-download" onclick="downloadFile('${file.filename}', '${escapeHtml(file.originalName)}')">
                    下载
                </button>
                <button class="btn btn-delete" onclick="deleteFile('${file.filename}', '${escapeHtml(file.originalName)}')">
                    删除
                </button>
            </div>
        </div>
    `).join('');
}

// 下载文件
function downloadFile(filename, originalName) {
    window.location.href = `${API_BASE}/api/download/${filename}`;
    showNotification(`正在下载: ${originalName}`, 'info');
}

// 删除文件
async function deleteFile(filename, originalName) {
    if (!confirm(`确定要删除文件 "${originalName}" 吗？`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/delete/${filename}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            showNotification('文件删除成功', 'success');
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
function viewFile(filename, originalName) {
    window.open(`viewer.html?file=${encodeURIComponent(filename)}`, '_blank');
}

// 3D查看文件
function view3DFile(filename, originalName) {
    window.open(`viewer3d.html?file=${encodeURIComponent(filename)}`, '_blank');
}
