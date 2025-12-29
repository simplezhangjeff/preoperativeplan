// 获取URL参数
const urlParams = new URLSearchParams(window.location.search);
const filename = urlParams.get('file');
const isFolder = urlParams.get('folder') === 'true';

// Three.js变量
let renderers = {};
let scenes = {};
let cameras = {};
let controls = {};
let stackHelpers = {};

// AMI.js变量
let loader = null;
let stack = null;

// 窗口预设
const presets = {
    bone: { windowWidth: 2000, windowCenter: 400 },
    soft: { windowWidth: 400, windowCenter: 40 },
    lung: { windowWidth: 1500, windowCenter: -600 },
    brain: { windowWidth: 80, windowCenter: 40 }
};

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    if (!filename) {
        showError('未指定文件或文件夹');
        return;
    }

    document.getElementById('fileName').textContent = decodeURIComponent(filename);

    try {
        // 初始化3D查看器
        await initViewer();

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
async function initViewer() {
    // 初始化四个视图面板
    initViewPanel('axialView', 'axial');
    initViewPanel('sagittalView', 'sagittal');
    initViewPanel('coronalView', 'coronal');
    initViewPanel('render3dView', '3d');

    // 开始渲染循环
    animate();
}

// 初始化单个视图面板
function initViewPanel(containerId, viewType) {
    const container = document.getElementById(containerId);

    // 创建场景
    const scene = new THREE.Scene();
    scenes[viewType] = scene;

    // 创建相机
    const camera = new THREE.OrthographicCamera(
        container.offsetWidth / -2,
        container.offsetWidth / 2,
        container.offsetHeight / 2,
        container.offsetHeight / -2,
        0.1,
        10000
    );
    cameras[viewType] = camera;

    // 创建渲染器
    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true
    });
    renderer.setSize(container.offsetWidth, container.offsetHeight);
    renderer.setClearColor(0x000000, 1);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    renderers[viewType] = renderer;

    // 创建控制器
    const control = new THREE.OrbitControls(camera, renderer.domElement);
    control.enableRotate = true;
    control.enableZoom = true;
    control.enablePan = true;
    control.rotateSpeed = viewType === '3d' ? 1.0 : 0.5;
    control.zoomSpeed = 1.2;
    control.panSpeed = 0.8;
    control.enableDamping = true;
    control.dampingFactor = 0.05;
    controls[viewType] = control;

    // 添加光源（仅3D视图）
    if (viewType === '3d') {
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(1, 1, 1);
        scene.add(light);

        const ambientLight = new THREE.AmbientLight(0x404040);
        scene.add(ambientLight);
    }
}

// 加载DICOM序列
async function loadDicomSeries(filename) {
    try {
        const loadingOverlay = document.getElementById('loadingOverlay');
        loadingOverlay.style.display = 'flex';

        let files = [];

        if (isFolder) {
            // 加载文件夹中的所有文件
            const folderResponse = await fetch(`/api/folder/${filename}`);
            const folderData = await folderResponse.json();

            if (!folderData.success || !folderData.files || folderData.files.length === 0) {
                throw new Error('文件夹中没有找到DICOM文件');
            }

            // 加载所有文件
            for (let i = 0; i < folderData.files.length; i++) {
                const file = folderData.files[i];
                const fileResponse = await fetch(file.path);
                const arrayBuffer = await fileResponse.arrayBuffer();
                files.push({
                    url: file.name,
                    buffer: arrayBuffer
                });
            }
        } else {
            // 加载单个文件
            const response = await fetch(`/api/download/${filename}`);
            const arrayBuffer = await response.arrayBuffer();
            files = [
                {
                    url: filename,
                    buffer: arrayBuffer
                }
            ];
        }

        // 创建AMI加载器
        loader = new AMI.VolumeLoader();

        // 加载DICOM数据
        loader.load(files).then(() => {
            // 获取序列
            const series = loader.data[0].mergeSeries(loader.data)[0];
            stack = series.stack[0];

            // 设置堆栈方向
            stack.prepare();

            // 创建堆栈辅助对象
            createStackHelpers();

            // 定位相机
            positionCameras();

            // 隐藏加载界面
            loadingOverlay.style.display = 'none';

        }).catch(error => {
            console.error('加载DICOM错误:', error);
            showError('加载DICOM文件失败: ' + error.message);
        });

    } catch (error) {
        console.error('加载文件错误:', error);
        throw error;
    }
}

// 创建堆栈辅助对象
function createStackHelpers() {
    // 轴位视图
    const axialHelper = new AMI.StackHelper(stack);
    axialHelper.bbox.visible = false;
    axialHelper.border.color = 0x2563eb;
    axialHelper.orientation = 2; // 轴位
    scenes.axial.add(axialHelper);
    stackHelpers.axial = axialHelper;

    // 矢状位视图
    const sagittalHelper = new AMI.StackHelper(stack);
    sagittalHelper.bbox.visible = false;
    sagittalHelper.border.color = 0x10b981;
    sagittalHelper.orientation = 1; // 矢状位
    scenes.sagittal.add(sagittalHelper);
    stackHelpers.sagittal = sagittalHelper;

    // 冠状位视图
    const coronalHelper = new AMI.StackHelper(stack);
    coronalHelper.bbox.visible = false;
    coronalHelper.border.color = 0xf59e0b;
    coronalHelper.orientation = 0; // 冠状位
    scenes.coronal.add(coronalHelper);
    stackHelpers.coronal = coronalHelper;

    // 3D视图 - 创建体积渲染
    create3DVolume();
}

// 创建3D体积渲染
function create3DVolume() {
    try {
        // 创建简单的网格表示
        const geometry = new THREE.BoxGeometry(
            stack.dimensionsIJK.x,
            stack.dimensionsIJK.y,
            stack.dimensionsIJK.z
        );

        const material = new THREE.MeshPhongMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.3,
            wireframe: false
        });

        const mesh = new THREE.Mesh(geometry, material);
        scenes['3d'].add(mesh);

        // 添加边界框
        const edges = new THREE.EdgesGeometry(geometry);
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x2563eb });
        const wireframe = new THREE.LineSegments(edges, lineMaterial);
        scenes['3d'].add(wireframe);

    } catch (error) {
        console.error('创建3D体积错误:', error);
    }
}

// 定位相机
function positionCameras() {
    const worldbb = stack.worldBoundingBox();
    const center = stack.worldCenter();

    // 轴位相机
    cameras.axial.position.set(center.x, center.y, center.z + worldbb[4] / 2);
    cameras.axial.lookAt(center.x, center.y, center.z);
    cameras.axial.updateProjectionMatrix();
    controls.axial.target.set(center.x, center.y, center.z);

    // 矢状位相机
    cameras.sagittal.position.set(center.x + worldbb[0] / 2, center.y, center.z);
    cameras.sagittal.lookAt(center.x, center.y, center.z);
    cameras.sagittal.updateProjectionMatrix();
    controls.sagittal.target.set(center.x, center.y, center.z);

    // 冠状位相机
    cameras.coronal.position.set(center.x, center.y + worldbb[2] / 2, center.z);
    cameras.coronal.lookAt(center.x, center.y, center.z);
    cameras.coronal.updateProjectionMatrix();
    controls.coronal.target.set(center.x, center.y, center.z);

    // 3D相机
    cameras['3d'].position.set(
        center.x + worldbb[0] / 2,
        center.y + worldbb[2] / 2,
        center.z + worldbb[4] / 2
    );
    cameras['3d'].lookAt(center.x, center.y, center.z);
    cameras['3d'].updateProjectionMatrix();
    controls['3d'].target.set(center.x, center.y, center.z);
}

// 渲染循环
function animate() {
    requestAnimationFrame(animate);

    // 更新所有控制器
    Object.values(controls).forEach(control => {
        control.update();
    });

    // 渲染所有视图
    Object.keys(renderers).forEach(viewType => {
        renderers[viewType].render(scenes[viewType], cameras[viewType]);
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
        if (stack) {
            positionCameras();
        }
    });
}

// 更新窗宽窗位
function updateWindowLevel(windowWidth, windowCenter) {
    if (stackHelpers.axial) {
        stackHelpers.axial.slice.windowWidth = windowWidth;
        stackHelpers.axial.slice.windowCenter = windowCenter;
    }
    if (stackHelpers.sagittal) {
        stackHelpers.sagittal.slice.windowWidth = windowWidth;
        stackHelpers.sagittal.slice.windowCenter = windowCenter;
    }
    if (stackHelpers.coronal) {
        stackHelpers.coronal.slice.windowWidth = windowWidth;
        stackHelpers.coronal.slice.windowCenter = windowCenter;
    }
}

// 更新3D不透明度
function update3DOpacity(opacity) {
    const mesh = scenes['3d'].children.find(child => child instanceof THREE.Mesh);
    if (mesh && mesh.material) {
        mesh.material.opacity = opacity;
    }
}

// 更新3D阈值
function update3DThreshold(threshold) {
    // 这里可以实现基于阈值的体积渲染
    console.log('更新阈值:', threshold);
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
    Object.keys(renderers).forEach(viewType => {
        const container = renderers[viewType].domElement.parentElement;
        cameras[viewType].aspect = container.offsetWidth / container.offsetHeight;
        cameras[viewType].updateProjectionMatrix();
        renderers[viewType].setSize(container.offsetWidth, container.offsetHeight);
    });
});
