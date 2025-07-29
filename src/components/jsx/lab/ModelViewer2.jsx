import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import GUI from 'lil-gui';
// --- THAY ĐỔI: Chỉ cần nhập một hàm duy nhất từ utility ---
import { modelLoader } from '../../../utils/modelLoader.js'; // Giả sử file nằm trong src/utils/
import { modelLoader2 } from '../../../utils/modelLoader2.js'; // Giả sử file nằm trong src/utils/
import { modelLoader3 } from '../../../utils/modelLoader3.js'; // Giả sử file nằm trong src/utils/



// --- CẤU HÌNH VÀ HÀM HELPER CHO SCENE ---
// Các hằng số và hàm helper riêng của ModelViewer giờ chỉ còn lại phần của World
const WORLD_AXES_CONFIG = [
    { dir: new THREE.Vector3(1, 0, 0), color: '#ff0000', text: 'X' },
    { dir: new THREE.Vector3(0, 1, 0), color: '#00ff00', text: 'Y' },
    { dir: new THREE.Vector3(0, 0, 1), color: '#0000ff', text: 'Z' }
];

// Hàm này vẫn cần thiết để tạo trục thế giới, nhưng không cần cho trục model nữa
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


const ModelViewer2 = () => {
    const mountRef = useRef(null);

    useEffect(() => {
        const currentMount = mountRef.current;
        if (!currentMount) return;

        // === SETUP SCENE, CAMERA, RENDERER, LIGHTS ===
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a1a);
        // Bật shadow cho renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Các thiết lập khác
        renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        currentMount.appendChild(renderer.domElement);

        const camera = new THREE.PerspectiveCamera(75, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000);
        camera.position.set(0, 2, 8);
        camera.lookAt(0, 0, 0);

        const ambientLight = new THREE.AmbientLight(0xdddddd, 0.9);
        scene.add(ambientLight);

        // Cấu hình DirectionalLight để tạo bóng đổ
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight.position.set(5, 10, 7.5);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 1024;
        directionalLight.shadow.mapSize.height = 1024;
        scene.add(directionalLight);

        const worldAxes = createLabeledAxes(5, WORLD_AXES_CONFIG, 4);
        // scene.add(worldAxes);

        // Thêm một mặt phẳng để nhận bóng đổ
        const planeGeometry = new THREE.PlaneGeometry(20, 20);
        const planeMaterial = new THREE.ShadowMaterial({ opacity: 0.3 });
        const plane = new THREE.Mesh(planeGeometry, planeMaterial);
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = -2; // Đặt bên dưới mô hình
        plane.receiveShadow = true;
        scene.add(plane);


        // === MOUSE CONTROLS (Không thay đổi) ===
        let isDragging = false;
        let previousMousePosition = { x: 0, y: 0 };
        const spherical = new THREE.Spherical();
        spherical.setFromVector3(camera.position);
        const onMouseDown = (event) => { isDragging = true; previousMousePosition = { x: event.clientX, y: event.clientY }; };
        const onMouseMove = (event) => { if (!isDragging) return; const deltaMove = { x: event.clientX - previousMousePosition.x, y: event.clientY - previousMousePosition.y }; spherical.theta -= deltaMove.x * 0.007; spherical.phi -= deltaMove.y * 0.007; spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi)); camera.position.setFromSpherical(spherical); camera.lookAt(0, 0, 0); previousMousePosition = { x: event.clientX, y: event.clientY }; };
        const onMouseUp = () => { isDragging = false; };
        const onMouseWheel = (event) => { event.preventDefault(); const zoomSpeed = 0.005; spherical.radius += event.deltaY * zoomSpeed; spherical.radius = Math.max(1, Math.min(20, spherical.radius)); camera.position.setFromSpherical(spherical); camera.lookAt(0, 0, 0); };
        currentMount.addEventListener('mousedown', onMouseDown);
        currentMount.addEventListener('mousemove', onMouseMove);
        currentMount.addEventListener('mouseup', onMouseUp);
        currentMount.addEventListener('mouseleave', onMouseUp);
        currentMount.addEventListener('wheel', onMouseWheel);

        const gui = new GUI();

        // --- CÀI ĐẶT GUI (được tách ra cho gọn) ---
        // Hàm này sẽ được gọi sau khi model container được tải thành công
        const setupGUI = (modelContainer) => {
            const rotationInDegrees = { x: THREE.MathUtils.radToDeg(modelContainer.rotation.x), y: THREE.MathUtils.radToDeg(modelContainer.rotation.y), z: THREE.MathUtils.radToDeg(modelContainer.rotation.z), };
            const updateRotationUI = () => {
                rotationInDegrees.x = THREE.MathUtils.radToDeg(modelContainer.rotation.x);
                rotationInDegrees.y = THREE.MathUtils.radToDeg(modelContainer.rotation.y);
                rotationInDegrees.z = THREE.MathUtils.radToDeg(modelContainer.rotation.z);
                gui.controllers.forEach(controller => controller.updateDisplay());
            };
            const rotationFolder = gui.addFolder('Kiểm soát góc xoay (Euler)');
            rotationFolder.add(rotationInDegrees, 'x', -180, 360, 1).name('X (rX) °').onChange(value => { modelContainer.rotation.x = THREE.MathUtils.degToRad(value); });
            rotationFolder.add(rotationInDegrees, 'y', -180, 180, 1).name('Y (rY) °').onChange(value => { modelContainer.rotation.y = THREE.MathUtils.degToRad(value); });
            rotationFolder.add(rotationInDegrees, 'z', -180, 180, 1).name('Z (rZ) °').onChange(value => { modelContainer.rotation.z = THREE.MathUtils.degToRad(value); });
            rotationFolder.open();
            const localRotationFolder = gui.addFolder('Xoay theo trục cục bộ (Local)');
            const rotationParams = { angle: 15, rotateOnLocalAxis: (axis) => { const angleRad = THREE.MathUtils.degToRad(rotationParams.angle); if (axis === 'x') modelContainer.rotateX(angleRad); else if (axis === 'y') modelContainer.rotateY(angleRad); else if (axis === 'z') modelContainer.rotateZ(angleRad); updateRotationUI(); } };
            localRotationFolder.add(rotationParams, 'angle', -180, 180, 1).name('Góc xoay (°)')
            localRotationFolder.add({ rotateX: () => rotationParams.rotateOnLocalAxis('x') }, 'rotateX').name('Xoay quanh rX');
            localRotationFolder.add({ rotateY: () => rotationParams.rotateOnLocalAxis('y') }, 'rotateY').name('Xoay quanh rY');
            localRotationFolder.add({ rotateZ: () => rotationParams.rotateOnLocalAxis('z') }, 'rotateZ').name('Xoay quanh rZ');
            localRotationFolder.open();
            updateRotationUI();
        }

        // --- LUỒNG TẢI MODEL CHÍNH ---
        const init = async () => {
            try {
                // 1. Gọi `modelLoader` và nhận về container đã được chuẩn bị sẵn
                const modelContainer = await modelLoader('/models/nhanDario.glb');

                // 2. Chỉ cần thêm container này vào scene là xong
                scene.add(modelContainer);

                // 3. Khởi tạo GUI để điều khiển container này
                setupGUI(modelContainer);

                console.log('Model container loaded and added to scene successfully.');
            } catch (error) {
                console.error('Failed to initialize the model scene:', error);
            }
        };

        init();


        // === RESIZE & ANIMATION & CLEANUP (Không thay đổi) ===
        const handleResize = () => { const width = currentMount.clientWidth; const height = currentMount.clientHeight; camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height); };
        window.addEventListener('resize', handleResize);
        let frameId = null;
        const animate = () => { frameId = requestAnimationFrame(animate); renderer.render(scene, camera); };
        animate();
        return () => {
            gui.destroy();
            cancelAnimationFrame(frameId);
            window.removeEventListener('resize', handleResize);
            currentMount.removeEventListener('mousedown', onMouseDown);
            currentMount.removeEventListener('mousemove', onMouseMove);
            currentMount.removeEventListener('mouseup', onMouseUp);
            currentMount.removeEventListener('mouseleave', onMouseUp);
            currentMount.removeEventListener('wheel', onMouseWheel);
            if (currentMount && renderer.domElement) { currentMount.removeChild(renderer.domElement); }
            scene.traverse((child) => { if (child.isMesh) { child.geometry.dispose(); if (child.material) { if (Array.isArray(child.material)) { child.material.forEach(material => material.dispose()); } else { child.material.dispose(); } } } });
            renderer.dispose();
        };
    }, []);

    return (
        <div
            ref={mountRef}
            style={{ width: '100vw', height: '100vh', cursor: 'grab' }}
        />
    );
};

export default ModelViewer2;