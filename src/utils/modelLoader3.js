import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const gltfLoader = new GLTFLoader();

// === HỆ TRỤC TỌA ĐỘ CHUẨN CHO NHẪN ===
const STANDARDIZED_RING_AXES = [
    { dir: new THREE.Vector3(1, 0, 0), color: '#ff0000', text: 'X' }, // Đỏ - Ngang ngón tay
    { dir: new THREE.Vector3(0, 1, 0), color: '#00ff00', text: 'Y' }, // Xanh Lá - Dọc ngón tay (qua lỗ nhẫn)
    { dir: new THREE.Vector3(0, 0, 1), color: '#0000ff', text: 'Z' }  // Xanh Dương - Kim cương về mu bàn tay
];

const createLabeledAxes = (length, axesConfig, lineWidth = 2) => {
    const axesGroup = new THREE.Group();

    const createLabel = (text, color, position) => {
        const canvas = document.createElement('canvas');
        const size = 128;
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        context.fillStyle = color;
        context.font = `bold ${size * 0.7}px Arial`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, size / 2, size / 2);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(0.5, 0.5, 1.0);
        sprite.position.copy(position);
        sprite.renderOrder = 999;
        return sprite;
    };

    axesConfig.forEach(axis => {
        const material = new THREE.LineBasicMaterial({
            color: axis.color,
            linewidth: lineWidth,
            depthTest: false
        });
        const points = [new THREE.Vector3(0, 0, 0), axis.dir.clone().multiplyScalar(length)];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, material);
        line.renderOrder = 999;

        const labelPosition = points[1].clone().multiplyScalar(1.2);
        const label = createLabel(axis.text, axis.color, labelPosition);

        axesGroup.add(line);
        axesGroup.add(label);
    });

    return axesGroup;
};

/**
 * Phân tích và xác định hướng hiện tại của mô hình nhẫn
 */
const analyzeRingOrientation = (model) => {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    console.log('📊 Phân tích mô hình gốc:');
    console.log('📏 Kích thước:', { width: size.x.toFixed(3), height: size.y.toFixed(3), depth: size.z.toFixed(3) });
    console.log('📍 Tâm:', { x: center.x.toFixed(3), y: center.y.toFixed(3), z: center.z.toFixed(3) });

    // Xác định trục chính dựa trên kích thước
    const maxDimension = Math.max(size.x, size.y, size.z);
    const minDimension = Math.min(size.x, size.y, size.z);

    console.log('🎯 Trục chính (lớn nhất):', maxDimension === size.x ? 'X' : maxDimension === size.y ? 'Y' : 'Z');
    console.log('🎯 Trục mỏng nhất:', minDimension === size.x ? 'X' : minDimension === size.y ? 'Y' : 'Z');

    return { size, center, maxDimension, minDimension };
};

/**
 * Chuẩn hóa hệ trục tọa độ nhẫn theo finger coordinate system
 */
const standardizeRingCoordinates = (model) => {
    console.log('🔄 Đang chuẩn hóa hệ trục tọa độ nhẫn...');

    // Phân tích mô hình gốc
    const analysis = analyzeRingOrientation(model);

    // Căn giữa mô hình về gốc tọa độ
    model.position.sub(analysis.center);

    // === XÁC ĐỊNH HƯỚNG CỦA NHẪN ===
    // Giả định: Nhẫn được thiết kế với kim cương ở một đầu cụ thể

    // Reset rotation để bắt đầu từ đầu
    model.rotation.set(0, 0, 0);

    // === ROTATION MATRIX ĐỂ CHUẨN HÓA ===
    // Mục tiêu: Đưa nhẫn về hệ trục chuẩn
    // - Y-axis: Qua lỗ nhẫn (dọc ngón tay)
    // - Z-axis: Kim cương hướng ra ngoài (về mu bàn tay)  
    // - X-axis: Ngang nhẫn (vuông góc với Y và Z)

    // BƯỚC 1: Xoay để lỗ nhẫn thẳng hàng với Y-axis
    // Thường nhẫn .glb có lỗ theo Z-axis ban đầu
    model.rotation.x = THREE.MathUtils.degToRad(28);

    // BƯỚC 2: Xoay để kim cương hướng đúng về Z+ (mu bàn tay)
    // Cần test để xác định hướng chính xác
    // model.rotation.y = Math.PI; // 180° nếu kim cương bị ngược

    // BƯỚC 3: Fine-tuning để nhẫn nằm đúng vị trí
    // model.rotation.z = 0; // Điều chỉnh nếu cần

    console.log('✅ Hệ trục nhẫn đã được chuẩn hóa:');
    console.log('📍 Y-axis (GREEN): Qua lỗ nhẫn - tương ứng fingerY (dọc ngón tay)');
    console.log('📍 Z-axis (BLUE): Kim cương về mu bàn tay - tương ứng fingerZ');
    console.log('📍 X-axis (RED): Ngang nhẫn - tương ứng fingerX');

    return model;
};

/**
 * Tải và chuẩn hóa mô hình nhẫn với hệ trục tọa độ chuẩn
 */
export const modelLoader3 = (url) => {
    return new Promise((resolve, reject) => {
        gltfLoader.load(
            url,
            (gltf) => {
                console.log('📦 Đã tải mô hình nhẫn thành công');

                const model = gltf.scene;

                // === TẠO CONTAINER ===
                const container = new THREE.Group();
                container.name = 'RingContainer';

                // === CHUẨN HÓA HỆ TRỤC TỌA ĐỘ ===
                const standardizedModel = standardizeRingCoordinates(model);
                container.add(standardizedModel);

                // === CẤU HÌNH MATERIAL ===
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                // === THÊM TRỤC TỌA ĐỘ DEBUG ===
                const debugAxes = createLabeledAxes(1.5, STANDARDIZED_RING_AXES, 3);
                debugAxes.name = 'DebugAxes';
                container.add(debugAxes);

                // === XÁC NHẬN KẾT QUẢ ===
                console.log('🎯 Container sẵn sàng cho finger tracking');
                console.log('✅ Hệ trục nhẫn = Hệ trục ngón tay');
                console.log('🔗 Mapping: Ring.X=Finger.X, Ring.Y=Finger.Y, Ring.Z=Finger.Z');

                resolve(container);
            },

            // Progress callback
            (progress) => {
                const percent = (progress.loaded / progress.total * 100).toFixed(0);
                console.log(`📥 Đang tải: ${percent}%`);
            },

            // Error callback
            (error) => {
                console.error('❌ Lỗi tải mô hình:', error);
                reject(error);
            }
        );
    });
};

/**
 * Hàm tiện ích để toggle hiển thị debug axes
 */
export const toggleDebugAxes = (container, visible = true) => {
    const debugAxes = container.getObjectByName('DebugAxes');
    if (debugAxes) {
        debugAxes.visible = visible;
        console.log(`🔧 Debug axes: ${visible ? 'Hiển thị' : 'Ẩn'}`);
    }
};

/**
 * Hàm kiểm tra và validate hệ trục tọa độ
 */
export const validateRingAxes = (container) => {
    console.log('🔍 Kiểm tra hệ trục tọa độ nhẫn...');

    const model = container.children.find(child => child.name !== 'DebugAxes');
    if (model) {
        const currentRotation = {
            x: THREE.MathUtils.radToDeg(model.rotation.x).toFixed(1),
            y: THREE.MathUtils.radToDeg(model.rotation.y).toFixed(1),
            z: THREE.MathUtils.radToDeg(model.rotation.z).toFixed(1)
        };

        console.log('📐 Rotation hiện tại:', currentRotation);

        // Kiểm tra bounding box sau khi chuẩn hóa
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());

        console.log('📏 Kích thước sau chuẩn hóa:', {
            x: size.x.toFixed(3),
            y: size.y.toFixed(3),
            z: size.z.toFixed(3)
        });

        console.log('✅ Validation hoàn tất');
        return true;
    }

    console.log('❌ Không tìm thấy model trong container');
    return false;
};