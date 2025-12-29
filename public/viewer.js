// 获取URL参数
const urlParams = new URLSearchParams(window.location.search);
const filename = urlParams.get('file');
const isFolder = urlParams.get('folder') === 'true';

let currentImageId = null;
let currentImageIds = []; // 序列图像ID列表
let currentImageIndex = 0;
let element = null;

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    if (!filename) {
        showError('未指定文件');
        return;
    }

    document.getElementById('fileName').textContent = decodeURIComponent(filename);

    try {
        // 初始化Cornerstone
        initializeCornerstone();

        // 加载DICOM文件或序列
        if (isFolder) {
            await loadDicomSeries(filename);
        } else {
            await loadDicomFile(filename);
        }

        // 设置工具栏
        setupToolbar();

        // 设置控制滑块
        setupControls();

    } catch (error) {
        console.error('初始化错误:', error);
        showError('加载失败: ' + error.message);
    }
});

// 初始化Cornerstone
function initializeCornerstone() {
    element = document.getElementById('dicomImage');

    // 配置WADO图像加载器
    cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
    cornerstoneWADOImageLoader.external.dicomParser = dicomParser;

    // 配置Web Worker（用于解析DICOM）
    const config = {
        maxWebWorkers: navigator.hardwareConcurrency || 1,
        startWebWorkersOnDemand: true,
        taskConfiguration: {
            decodeTask: {
                initializeCodecsOnStartup: true,
                usePDFJS: false
            }
        }
    };

    cornerstoneWADOImageLoader.webWorkerManager.initialize(config);

    // 启用Cornerstone元素
    cornerstone.enable(element);

    // 初始化Cornerstone Tools
    cornerstoneTools.external.cornerstone = cornerstone;
    cornerstoneTools.external.cornerstoneMath = cornerstoneMath;
    cornerstoneTools.init();
}

// 加载DICOM文件
async function loadDicomFile(filename) {
    try {
        const loadingOverlay = document.getElementById('loadingOverlay');
        loadingOverlay.style.display = 'flex';

        // 获取文件
        const response = await fetch(`/api/download/${filename}`);
        const arrayBuffer = await response.arrayBuffer();

        // 创建Blob URL
        const blob = new Blob([arrayBuffer], { type: 'application/dicom' });
        const fileUrl = URL.createObjectURL(blob);

        // 使用wadouri加载
        currentImageId = cornerstoneWADOImageLoader.wadouri.fileManager.add(blob);

        // 加载并显示图像
        const image = await cornerstone.loadImage(currentImageId);
        cornerstone.displayImage(element, image);

        // 隐藏加载界面
        loadingOverlay.style.display = 'none';

        // 更新信息显示
        updateImageInfo(image);
        updateDicomInfo(image);

        // 启用默认工具（窗宽窗位）
        activateTool('Wwwc');

        // 监听图像更新
        element.addEventListener('cornerstoneimagerendered', onImageRendered);

    } catch (error) {
        console.error('加载DICOM文件错误:', error);
        throw error;
    }
}

// 加载DICOM序列
async function loadDicomSeries(foldername) {
    try {
        const loadingOverlay = document.getElementById('loadingOverlay');
        loadingOverlay.style.display = 'flex';
        loadingOverlay.innerHTML = `
            <div>加载DICOM序列中...</div>
            <div style="font-size: 0.9em; color: #9ca3af; margin-top: 10px;">正在加载多个文件</div>
        `;

        // 获取文件夹信息
        const response = await fetch(`/api/folder/${foldername}`);
        const data = await response.json();

        if (!data.success || !data.files || data.files.length === 0) {
            throw new Error('文件夹中没有找到DICOM文件');
        }

        // 加载所有DICOM文件
        currentImageIds = [];
        for (let i = 0; i < data.files.length; i++) {
            const file = data.files[i];
            const fileResponse = await fetch(file.path);
            const arrayBuffer = await fileResponse.arrayBuffer();
            const blob = new Blob([arrayBuffer], { type: 'application/dicom' });
            const imageId = cornerstoneWADOImageLoader.wadouri.fileManager.add(blob);
            currentImageIds.push(imageId);
        }

        if (currentImageIds.length === 0) {
            throw new Error('未能加载任何DICOM文件');
        }

        // 显示第一张图像
        currentImageIndex = 0;
        currentImageId = currentImageIds[currentImageIndex];
        const image = await cornerstone.loadImage(currentImageId);
        cornerstone.displayImage(element, image);

        // 隐藏加载界面
        loadingOverlay.style.display = 'none';

        // 更新信息显示
        updateImageInfo(image);
        updateDicomInfo(image);

        // 显示序列信息
        document.getElementById('fileName').textContent = `${decodeURIComponent(foldername)} (${currentImageIndex + 1}/${currentImageIds.length})`;

        // 添加键盘导航
        setupSeriesNavigation();

        // 启用默认工具（窗宽窗位）
        activateTool('Wwwc');

        // 监听图像更新
        element.addEventListener('cornerstoneimagerendered', onImageRendered);

    } catch (error) {
        console.error('加载DICOM序列错误:', error);
        throw error;
    }
}

// 设置序列导航
function setupSeriesNavigation() {
    // 键盘导航
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
            e.preventDefault();
            navigateImage(-1);
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
            e.preventDefault();
            navigateImage(1);
        }
    });

    // 鼠标滚轮导航
    element.addEventListener('wheel', (e) => {
        if (e.ctrlKey || currentImageIds.length > 1) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 1 : -1;
            navigateImage(delta);
        }
    });
}

// 导航到指定图像
async function navigateImage(delta) {
    if (currentImageIds.length <= 1) return;

    currentImageIndex += delta;
    if (currentImageIndex < 0) currentImageIndex = currentImageIds.length - 1;
    if (currentImageIndex >= currentImageIds.length) currentImageIndex = 0;

    currentImageId = currentImageIds[currentImageIndex];
    const image = await cornerstone.loadImage(currentImageId);
    cornerstone.displayImage(element, image);

    // 更新序列信息
    const fileName = document.getElementById('fileName').textContent.split(' (')[0];
    document.getElementById('fileName').textContent = `${fileName} (${currentImageIndex + 1}/${currentImageIds.length})`;

    updateImageInfo(image);
    updateDicomInfo(image);
}

// 更新图像信息显示
function updateImageInfo(image) {
    const viewport = cornerstone.getViewport(element);

    document.getElementById('windowWidth').textContent = Math.round(viewport.voi.windowWidth);
    document.getElementById('windowCenter').textContent = Math.round(viewport.voi.windowCenter);
    document.getElementById('zoomLevel').textContent = Math.round(viewport.scale * 100) + '%';

    // 更新滑块
    document.getElementById('windowWidthSlider').value = viewport.voi.windowWidth;
    document.getElementById('windowCenterSlider').value = viewport.voi.windowCenter;
    document.getElementById('zoomSlider').value = viewport.scale;

    // 显示图像元数据
    const metadata = document.getElementById('imageMetadata');
    metadata.innerHTML = `
        <div class="info-item">
            <span class="info-label">宽度</span>
            <span class="info-value">${image.width}px</span>
        </div>
        <div class="info-item">
            <span class="info-label">高度</span>
            <span class="info-value">${image.height}px</span>
        </div>
        <div class="info-item">
            <span class="info-label">像素间距</span>
            <span class="info-value">${image.rowPixelSpacing?.toFixed(2) || 'N/A'}</span>
        </div>
        <div class="info-item">
            <span class="info-label">列像素间距</span>
            <span class="info-value">${image.columnPixelSpacing?.toFixed(2) || 'N/A'}</span>
        </div>
        <div class="info-item">
            <span class="info-label">最小像素值</span>
            <span class="info-value">${image.minPixelValue}</span>
        </div>
        <div class="info-item">
            <span class="info-label">最大像素值</span>
            <span class="info-value">${image.maxPixelValue}</span>
        </div>
    `;
}

// 更新DICOM信息
function updateDicomInfo(image) {
    try {
        const dataSet = cornerstoneWADOImageLoader.wadouri.dataSetCacheManager.get(currentImageId);

        const patientName = dataSet.string('x00100010') || 'N/A';
        const patientId = dataSet.string('x00100020') || 'N/A';
        const studyDate = dataSet.string('x00080020') || 'N/A';
        const modality = dataSet.string('x00080060') || 'N/A';
        const studyDescription = dataSet.string('x00081030') || 'N/A';
        const seriesDescription = dataSet.string('x0008103e') || 'N/A';

        const dicomInfo = document.getElementById('dicomInfo');
        dicomInfo.innerHTML = `
            <div class="info-item">
                <span class="info-label">患者姓名</span>
                <span class="info-value">${patientName}</span>
            </div>
            <div class="info-item">
                <span class="info-label">患者ID</span>
                <span class="info-value">${patientId}</span>
            </div>
            <div class="info-item">
                <span class="info-label">检查日期</span>
                <span class="info-value">${studyDate}</span>
            </div>
            <div class="info-item">
                <span class="info-label">影像类型</span>
                <span class="info-value">${modality}</span>
            </div>
            <div class="info-item">
                <span class="info-label">检查描述</span>
                <span class="info-value">${studyDescription}</span>
            </div>
            <div class="info-item">
                <span class="info-label">序列描述</span>
                <span class="info-value">${seriesDescription}</span>
            </div>
        `;
    } catch (error) {
        console.error('读取DICOM信息错误:', error);
    }
}

// 图像渲染事件
function onImageRendered(event) {
    const viewport = event.detail.viewport;

    document.getElementById('windowWidth').textContent = Math.round(viewport.voi.windowWidth);
    document.getElementById('windowCenter').textContent = Math.round(viewport.voi.windowCenter);
    document.getElementById('zoomLevel').textContent = Math.round(viewport.scale * 100) + '%';
}

// 设置工具栏
function setupToolbar() {
    // 重置按钮
    document.getElementById('resetBtn').addEventListener('click', () => {
        cornerstone.reset(element);
    });

    // 反色按钮
    document.getElementById('invertBtn').addEventListener('click', () => {
        const viewport = cornerstone.getViewport(element);
        viewport.invert = !viewport.invert;
        cornerstone.setViewport(element, viewport);
    });

    // 窗宽窗位工具
    document.getElementById('wwwcBtn').addEventListener('click', () => {
        activateTool('Wwwc');
        setActiveButton('wwwcBtn');
    });

    // 平移工具
    document.getElementById('panBtn').addEventListener('click', () => {
        activateTool('Pan');
        setActiveButton('panBtn');
    });

    // 缩放工具
    document.getElementById('zoomBtn').addEventListener('click', () => {
        activateTool('Zoom');
        setActiveButton('zoomBtn');
    });
}

// 激活工具
function activateTool(toolName) {
    // 停用所有工具
    cornerstoneTools.setToolDisabled('Wwwc');
    cornerstoneTools.setToolDisabled('Pan');
    cornerstoneTools.setToolDisabled('Zoom');

    // 激活选定的工具
    const toolConfig = {
        mouseButtonMask: 1 // 左键
    };

    cornerstoneTools.addTool(cornerstoneTools[`${toolName}Tool`]);
    cornerstoneTools.setToolActive(toolName, toolConfig);
}

// 设置活动按钮样式
function setActiveButton(btnId) {
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(btnId).classList.add('active');
}

// 设置控制滑块
function setupControls() {
    // 窗宽滑块
    document.getElementById('windowWidthSlider').addEventListener('input', (e) => {
        const viewport = cornerstone.getViewport(element);
        viewport.voi.windowWidth = parseFloat(e.target.value);
        cornerstone.setViewport(element, viewport);
    });

    // 窗位滑块
    document.getElementById('windowCenterSlider').addEventListener('input', (e) => {
        const viewport = cornerstone.getViewport(element);
        viewport.voi.windowCenter = parseFloat(e.target.value);
        cornerstone.setViewport(element, viewport);
    });

    // 缩放滑块
    document.getElementById('zoomSlider').addEventListener('input', (e) => {
        const viewport = cornerstone.getViewport(element);
        viewport.scale = parseFloat(e.target.value);
        cornerstone.setViewport(element, viewport);
    });
}

// 显示错误
function showError(message) {
    const loadingOverlay = document.getElementById('loadingOverlay');
    loadingOverlay.innerHTML = `<div class="error-message">${message}</div>`;
}
