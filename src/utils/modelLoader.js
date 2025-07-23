// src/utils/modelLoader.js

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Khởi tạo loader một lần duy nhất để tái sử dụng
const gltfLoader = new GLTFLoader();

// --- HELPER FUNCTIONS (Sao chép từ ModelViewer.jsx) ---
const RING_AXES_CONFIG = [
    { dir: new THREE.Vector3(1, 0, 0), color: '#00ffff', text: 'rX' },
    { dir: new THREE.Vector3(0, 1, 0), color: '#ff00ff', text: 'rY' },
    { dir: new THREE.Vector3(0, 0, 1), color: '#ffff00', text: 'rZ' }
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
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(0.5, 0.5, 1.0);
        sprite.position.copy(position);
        return sprite;
    };
    axesConfig.forEach(axis => {
        const material = new THREE.LineBasicMaterial({ color: axis.color, linewidth: lineWidth });
        const points = [new THREE.Vector3(0, 0, 0), axis.dir.clone().multiplyScalar(length)];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, material);
        const labelPosition = points[1].clone().multiplyScalar(1.2);
        const label = createLabel(axis.text, axis.color, labelPosition);
        axesGroup.add(line);
        axesGroup.add(label);
    });
    return axesGroup;
};


/**
 * Tải, chuẩn hóa và trả về một container (THREE.Group) chứa mô hình 3D và các trục tọa độ cục bộ.
 * @param {string} url Đường dẫn đến file .glb
 * @returns {Promise<THREE.Group>} Một Promise sẽ resolve với container đã được chuẩn hóa.
 */
export const modelLoader = (url) => {
    return new Promise((resolve, reject) => {
        gltfLoader.load(
            url,
            (gltf) => {
                const model = gltf.scene;

                // --- BƯỚC CHUẨN HÓA ---

                // 1. Tạo container để chứa model và các trục
                const container = new THREE.Group();

                // 2. Căn giữa model trước khi xoay
                const box = new THREE.Box3().setFromObject(model);
                const center = box.getCenter(new THREE.Vector3());
                model.position.sub(center);

                // 3. Áp dụng góc xoay "hiệu chỉnh" để đưa model về hướng mong muốn
                // Logic này giống hệt trong ModelViewer.jsx cũ
                model.rotation.y = Math.PI; // Tương đương 180 độ
                // model.rotation.z = THREE.MathUtils.degToRad(4);
                // model.rotation.x = THREE.MathUtils.degToRad(40);
                model.rotation.x = THREE.MathUtils.degToRad(60); // Xoay để "dựng đứng" nhẫn dậy

                // 4. Thêm model đã được xoay vào container
                container.add(model);

                // 5. Tạo và thêm các trục tọa độ cục bộ vào container
                // const modelAxes = createLabeledAxes(2, RING_AXES_CONFIG, 2);
                // container.add(modelAxes);

                // 6. Bật tính năng đổ bóng
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                const boxHelper = new THREE.Box3Helper(new THREE.Box3().setFromObject(container), 0xffffff);
                container.add(boxHelper);

                const containerAxes = createLabeledAxes(2, RING_AXES_CONFIG, 2);
                container.add(containerAxes);
                // Tải thành công, trả về container đã "đóng gói" hoàn chỉnh
                resolve(container);
            },
            undefined,
            (error) => {
                console.error('An error happened while loading the model:', error);
                reject(error);
            }
        );
    });
};