// 获取URL参数
const urlParams = new URLSearchParams(window.location.search);
const filename = urlParams.get('file');
const isFolder = urlParams.get('folder') === 'true';

// VTK.js对象
const vtk = window.vtk;
let fullScreenRenderer = null;
let renderWindow = null;
let renderer = null;
let volumeActor = null;
let volumeMapper = null;
let imageData = null;

// MPR渲染器
let mprRenderers = {};
let mprRenderWindows = {};

// 窗口预设
const presets = {
    bone: { windowWidth: 2000, windowCenter: 400 },
    soft: { windowWidth: 400, windowCenter: 40 },
    lung: { windowWidth: 1500, windowCenter: -600 },
    brain: { windowWidth: 80, windowCenter: 40 }
};

// 初始化Cornerstone
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
cornerstoneWADOImageLoader.configure({
    useWebWorkers: true,
});

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    if (!filename) {
        showError('未指定文件或文件夹');
        return;
    }

    document.getElementById('fileName').textContent = decodeURIComponent(filename);

    try {
        // 初始化查看器
        initViewers();

        // 加载DICOM文件
        await loadDicomSeries(filename);

        // 设置控制器
        setupControls();

    } catch (error) {
        console.error('初始化错误:', error);
        showError('加载失败: ' + error.message);
    }
});

// 初始化查看器
function initViewers() {
    // 初始化3D体积渲染视图
    init3DView();

    // 初始化三个MPR视图
    initMPRView('axialView', 2); // Z轴
    initMPRView('sagittalView', 0); // X轴
    initMPRView('coronalView', 1); // Y轴
}

// 初始化3D视图
function init3DView() {
    const container = document.getElementById('render3dView');

    // 创建全屏渲染器
    fullScreenRenderer = vtk.Rendering.Misc.vtkFullScreenRenderWindow.newInstance({
        container: container,
        background: [0, 0, 0]
    });

    renderer = fullScreenRenderer.getRenderer();
    renderWindow = fullScreenRenderer.getRenderWindow();

    // 设置相机
    const camera = renderer.getActiveCamera();
    camera.setPosition(0, 0, -500);
    camera.setFocalPoint(0, 0, 0);
    camera.setViewUp(0, -1, 0);

    // 创建体积渲染mapper
    volumeMapper = vtk.Rendering.Core.vtkVolumeMapper.newInstance();
    volumeMapper.setSampleDistance(1.0);

    // 创建体积actor
    volumeActor = vtk.Rendering.Core.vtkVolume.newInstance();
    volumeActor.setMapper(volumeMapper);

    renderer.addVolume(volumeActor);
}

// 初始化MPR视图
function initMPRView(containerId, slicingMode) {
    const container = document.getElementById(containerId);

    // 创建全屏渲染器
    const fullScreenRenderWindow = vtk.Rendering.Misc.vtkFullScreenRenderWindow.newInstance({
        container: container,
        background: [0, 0, 0]
    });

    const mprRenderer = fullScreenRenderWindow.getRenderer();
    const mprRenderWindow = fullScreenRenderWindow.getRenderWindow();

    // 创建图像切片mapper
    const imageMapper = vtk.Rendering.Core.vtkImageMapper.newInstance();
    imageMapper.setSlicingMode(slicingMode);

    // 创建图像切片actor
    const imageActor = vtk.Rendering.Core.vtkImageSlice.newInstance();
    imageActor.setMapper(imageMapper);

    mprRenderer.addActor(imageActor);

    // 保存引用
    mprRenderers[containerId] = {
        renderer: mprRenderer,
        renderWindow: mprRenderWindow,
        mapper: imageMapper,
        actor: imageActor,
        slicingMode: slicingMode
    };
}

// 加载DICOM序列
async function loadDicomSeries(filename) {
    try {
        const loadingOverlay = document.getElementById('loadingOverlay');
        loadingOverlay.style.display = 'flex';

        let imageIds = [];

        if (isFolder) {
            // 加载文件夹中的所有文件
            const folderResponse = await fetch(`/api/folder/${filename}`);
            const folderData = await folderResponse.json();

            if (!folderData.success || !folderData.files || folderData.files.length === 0) {
                throw new Error('文件夹中没有找到DICOM文件');
            }

            // 为每个文件创建imageId
            for (const file of folderData.files) {
                const imageId = `wadouri:${window.location.origin}${file.path}`;
                imageIds.push(imageId);
            }
        } else {
            // 加载单个文件
            const imageId = `wadouri:${window.location.origin}/api/download/${filename}`;
            imageIds = [imageId];
        }

        console.log('加载图像数量:', imageIds.length);

        // 加载所有图像并获取像素数据
        const images = [];
        for (let i = 0; i < imageIds.length; i++) {
            const image = await cornerstone.loadImage(imageIds[i]);
            images.push(image);

            // 更新加载进度
            const progress = Math.round((i + 1) / imageIds.length * 100);
            loadingOverlay.querySelector('div:nth-child(2)').textContent =
                `加载DICOM序列... (${i + 1}/${imageIds.length}) ${progress}%`;
        }

        console.log('所有图像加载完成，开始构建3D数据');

        // 构建3D图像数据
        await build3DImageData(images);

        // 隐藏加载界面
        loadingOverlay.style.display = 'none';

    } catch (error) {
        console.error('加载文件错误:', error);
        showError('加载DICOM文件失败: ' + error.message);
        document.getElementById('loadingOverlay').style.display = 'flex';
    }
}

// 构建3D图像数据
async function build3DImageData(images) {
    if (images.length === 0) {
        throw new Error('没有图像数据');
    }

    const firstImage = images[0];
    const width = firstImage.width;
    const height = firstImage.height;
    const depth = images.length;

    console.log('图像尺寸:', width, 'x', height, 'x', depth);

    // 创建像素数据数组
    const pixelData = new Int16Array(width * height * depth);

    // 填充像素数据
    for (let z = 0; z < depth; z++) {
        const image = images[z];
        const imagePixelData = image.getPixelData();

        for (let i = 0; i < imagePixelData.length; i++) {
            pixelData[z * width * height + i] = imagePixelData[i];
        }
    }

    console.log('像素数据范围:', Math.min(...pixelData), '-', Math.max(...pixelData));

    // 创建VTK图像数据
    imageData = vtk.Common.DataModel.vtkImageData.newInstance();
    imageData.setDimensions(width, height, depth);

    // 设置间距（从DICOM中获取）
    const pixelSpacing = firstImage.rowPixelSpacing || 1.0;
    const sliceThickness = images.length > 1 ?
        Math.abs((images[1].imagePositionPatient?.[2] || 0) - (firstImage.imagePositionPatient?.[2] || 0)) : 1.0;

    imageData.setSpacing(pixelSpacing, pixelSpacing, sliceThickness || 1.0);
    imageData.setOrigin(0, 0, 0);

    // 设置标量数据
    const dataArray = vtk.Common.Core.vtkDataArray.newInstance({
        numberOfComponents: 1,
        values: pixelData
    });
    imageData.getPointData().setScalars(dataArray);

    console.log('VTK图像数据创建完成');

    // 设置到体积mapper
    volumeMapper.setInputData(imageData);

    // 设置传输函数
    setupTransferFunction();

    // 设置到MPR视图
    setupMPRViews();

    // 重置相机
    renderer.resetCamera();
    renderWindow.render();

    // 渲染所有MPR视图
    Object.values(mprRenderers).forEach(mpr => {
        mpr.renderer.resetCamera();
        mpr.renderWindow.render();
    });
}

// 设置传输函数
function setupTransferFunction() {
    const dataArray = imageData.getPointData().getScalars();
    const dataRange = dataArray.getRange();

    console.log('数据范围:', dataRange);

    // 创建颜色传输函数
    const colorTransferFunction = vtk.Rendering.Core.vtkColorTransferFunction.newInstance();

    // 默认使用骨窗设置
    const windowWidth = 2000;
    const windowCenter = 400;
    const low = windowCenter - windowWidth / 2;
    const high = windowCenter + windowWidth / 2;

    colorTransferFunction.addRGBPoint(low, 0.0, 0.0, 0.0);
    colorTransferFunction.addRGBPoint(windowCenter, 0.9, 0.9, 0.9);
    colorTransferFunction.addRGBPoint(high, 1.0, 1.0, 1.0);

    // 创建不透明度传输函数
    const opacityTransferFunction = vtk.Common.DataModel.vtkPiecewiseFunction.newInstance();

    // 使用渐变不透明度，增强3D效果
    opacityTransferFunction.addPoint(low, 0.0);
    opacityTransferFunction.addPoint(low + windowWidth * 0.3, 0.0);
    opacityTransferFunction.addPoint(windowCenter, 0.3);
    opacityTransferFunction.addPoint(high - windowWidth * 0.2, 0.6);
    opacityTransferFunction.addPoint(high, 0.8);

    // 应用到体积
    volumeActor.getProperty().setRGBTransferFunction(0, colorTransferFunction);
    volumeActor.getProperty().setScalarOpacity(0, opacityTransferFunction);
    volumeActor.getProperty().setInterpolationTypeToLinear();
    volumeActor.getProperty().setShade(true);
    volumeActor.getProperty().setAmbient(0.3);
    volumeActor.getProperty().setDiffuse(0.7);
    volumeActor.getProperty().setSpecular(0.3);
    volumeActor.getProperty().setSpecularPower(8.0);
}

// 设置MPR视图
function setupMPRViews() {
    Object.values(mprRenderers).forEach(mpr => {
        mpr.mapper.setInputData(imageData);

        // 设置初始切片位置为中间
        const dims = imageData.getDimensions();
        const sliceIndex = Math.floor(dims[mpr.slicingMode] / 2);
        mpr.mapper.setSlice(sliceIndex);

        // 设置窗宽窗位
        const property = mpr.actor.getProperty();
        property.setColorWindow(2000);
        property.setColorLevel(400);
    });
}

// 设置控制器
function setupControls() {
    // 窗宽滑块
    const wwSlider = document.getElementById('windowWidthSlider');
    const wwValue = document.getElementById('wwValue');
    wwSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        wwValue.textContent = value;
        updateWindowLevel(value, parseInt(document.getElementById('windowCenterSlider').value));
    });

    // 窗位滑块
    const wcSlider = document.getElementById('windowCenterSlider');
    const wcValue = document.getElementById('wcValue');
    wcSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        wcValue.textContent = value;
        updateWindowLevel(parseInt(document.getElementById('windowWidthSlider').value), value);
    });

    // 不透明度滑块
    const opacitySlider = document.getElementById('opacitySlider');
    const opacityValue = document.getElementById('opacityValue');
    opacitySlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        opacityValue.textContent = value.toFixed(2);
        update3DOpacity(value);
    });

    // 阈值滑块
    const thresholdSlider = document.getElementById('thresholdSlider');
    const thresholdValue = document.getElementById('thresholdValue');
    thresholdSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        thresholdValue.textContent = value;
        update3DThreshold(value);
    });

    // 重置视图按钮
    document.getElementById('resetViewBtn').addEventListener('click', () => {
        if (renderer) {
            renderer.resetCamera();
            renderWindow.render();
        }
        Object.values(mprRenderers).forEach(mpr => {
            mpr.renderer.resetCamera();
            mpr.renderWindow.render();
        });
    });
}

// 更新窗宽窗位
function updateWindowLevel(windowWidth, windowCenter) {
    if (!imageData) return;

    // 更新3D体积渲染的颜色传输函数
    const colorTransferFunction = vtk.Rendering.Core.vtkColorTransferFunction.newInstance();

    const low = windowCenter - windowWidth / 2;
    const high = windowCenter + windowWidth / 2;

    colorTransferFunction.addRGBPoint(low, 0.0, 0.0, 0.0);
    colorTransferFunction.addRGBPoint(windowCenter, 0.9, 0.9, 0.9);
    colorTransferFunction.addRGBPoint(high, 1.0, 1.0, 1.0);

    volumeActor.getProperty().setRGBTransferFunction(0, colorTransferFunction);

    // 更新MPR视图的窗宽窗位
    Object.values(mprRenderers).forEach(mpr => {
        const property = mpr.actor.getProperty();
        property.setColorWindow(windowWidth);
        property.setColorLevel(windowCenter);
        mpr.renderWindow.render();
    });

    renderWindow.render();
}

// 更新3D不透明度
function update3DOpacity(maxOpacity) {
    if (!imageData || !volumeActor) return;

    const dataArray = imageData.getPointData().getScalars();
    const dataRange = dataArray.getRange();

    const windowWidth = parseInt(document.getElementById('windowWidthSlider').value);
    const windowCenter = parseInt(document.getElementById('windowCenterSlider').value);
    const low = windowCenter - windowWidth / 2;
    const high = windowCenter + windowWidth / 2;

    // 创建新的不透明度传输函数
    const opacityTransferFunction = vtk.Common.DataModel.vtkPiecewiseFunction.newInstance();

    opacityTransferFunction.addPoint(low, 0.0);
    opacityTransferFunction.addPoint(low + windowWidth * 0.3, 0.0);
    opacityTransferFunction.addPoint(windowCenter, maxOpacity * 0.4);
    opacityTransferFunction.addPoint(high - windowWidth * 0.2, maxOpacity * 0.7);
    opacityTransferFunction.addPoint(high, maxOpacity);

    volumeActor.getProperty().setScalarOpacity(0, opacityTransferFunction);
    renderWindow.render();
}

// 更新3D阈值
function update3DThreshold(threshold) {
    if (!imageData || !volumeActor) return;

    const windowWidth = parseInt(document.getElementById('windowWidthSlider').value);
    const windowCenter = parseInt(document.getElementById('windowCenterSlider').value);
    const high = windowCenter + windowWidth / 2;

    // 创建基于阈值的不透明度函数
    const opacityTransferFunction = vtk.Common.DataModel.vtkPiecewiseFunction.newInstance();
    const maxOpacity = parseFloat(document.getElementById('opacitySlider').value);

    opacityTransferFunction.addPoint(threshold - 100, 0.0);
    opacityTransferFunction.addPoint(threshold, 0.0);
    opacityTransferFunction.addPoint(threshold + 100, maxOpacity * 0.5);
    opacityTransferFunction.addPoint(high, maxOpacity);

    volumeActor.getProperty().setScalarOpacity(0, opacityTransferFunction);
    renderWindow.render();
}

// 应用窗口预设
function applyPreset(presetName) {
    const preset = presets[presetName];
    if (preset) {
        document.getElementById('windowWidthSlider').value = preset.windowWidth;
        document.getElementById('windowCenterSlider').value = preset.windowCenter;
        document.getElementById('wwValue').textContent = preset.windowWidth;
        document.getElementById('wcValue').textContent = preset.windowCenter;
        updateWindowLevel(preset.windowWidth, preset.windowCenter);
    }
}

// 显示错误
function showError(message) {
    const loadingOverlay = document.getElementById('loadingOverlay');
    loadingOverlay.innerHTML = `<div class="error-message">${message}</div>`;
}

// 窗口调整大小
window.addEventListener('resize', () => {
    if (renderWindow) {
        renderWindow.render();
    }
    Object.values(mprRenderers).forEach(mpr => {
        mpr.renderWindow.render();
    });
});
