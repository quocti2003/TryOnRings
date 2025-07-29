import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import GUI from 'lil-gui';

// --- CẤU HÌNH VÀ HÀM HELPER ---
const WORLD_AXES_CONFIG = [
    { dir: new THREE.Vector3(1, 0, 0), color: '#ff0000', text: 'X' },
    { dir: new THREE.Vector3(0, 1, 0), color: '#00ff00', text: 'Y' },
    { dir: new THREE.Vector3(0, 0, 1), color: '#0000ff', text: 'Z' }
];
const RING_AXES_CONFIG = [
    { dir: new THREE.Vector3(1, 0, 0), color: '#00ffff', text: 'rX' },
    { dir: new THREE.Vector3(0, 1, 0), color: '#ff00ff', text: 'rY' },
    { dir: new THREE.Vector3(0, 0, 1), color: '#ffff00', text: 'rZ' }
];

// --- THAY ĐỔI BẮT ĐẦU TẠI ĐÂY ---
// Thêm tham số `lineWidth` với giá trị mặc định là 2
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
        // Sử dụng giá trị `lineWidth` được truyền vào
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


const ModelViewer = () => {
    const mountRef = useRef(null);

    useEffect(() => {
        const currentMount = mountRef.current;
        if (!currentMount) return;

        // === SETUP SCENE, CAMERA, RENDERER, LIGHTS ===
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a1a);
        const camera = new THREE.PerspectiveCamera(75, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000);
        camera.position.set(0, 2, 8);
        camera.lookAt(0, 0, 0);
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        currentMount.appendChild(renderer.domElement);
        const ambientLight = new THREE.AmbientLight(0xdddddd, 0.9);
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight.position.set(5, 10, 7.5);
        scene.add(directionalLight);

        // --- THAY ĐỔI CÁCH GỌI HÀM ---
        // Tạo trục thế giới với lineWidth = 4 (gấp đôi 2)
        const worldAxes = createLabeledAxes(5, WORLD_AXES_CONFIG, 4);
        scene.add(worldAxes);
        // --- KẾT THÚC THAY ĐỔI ---

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
        let container = null;

        const gltfLoader = new GLTFLoader();
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('/draco/');
        gltfLoader.setDRACOLoader(dracoLoader);

        gltfLoader.load(
            '/models/nhanDario.glb',
            (gltf) => {
                const ringModel = gltf.scene;
                container = new THREE.Group();
                scene.add(container);

                // Căn giữa model vào TÂM của container (không thay đổi)
                const box = new THREE.Box3().setFromObject(ringModel);
                const center = box.getCenter(new THREE.Vector3());
                ringModel.position.sub(center);

                // --- THAY ĐỔI LỚN BẮT ĐẦU TỪ ĐÂY ---

                // 1. ÁP DỤNG GÓC XOAY HIỆU CHỈNH VÀO CHÍNH MODEL
                // Đây là bước "dựng vuông gốc" chiếc nhẫn lên ngón áp út.
                // const correctionYAngleRad = THREE.MathUtils.degToRad(180);
                // ringModel.rotation.y = correctionYAngleRad;

                // const correctionXAngleRad = THREE.MathUtils.degToRad(140);
                // ringModel.rotation.x = correctionXAngleRad;


                // 2. THÊM MODEL ĐÃ ĐƯỢC HIỆU CHỈNH VÀO CONTAINER
                // Bây giờ, container chứa một chiếc nhẫn đã đứng thẳng,
                // trong khi chính container vẫn có góc xoay là (0,0,0).
                container.add(ringModel);

                // 3. THÊM HỆ TRỤC CỤC BỘ VÀO CONTAINER
                // Vì container có góc xoay là (0,0,0), hệ trục này sẽ khởi đầu
                // song song hoàn hảo với hệ trục thế giới.
                const modelAxes = createLabeledAxes(2, RING_AXES_CONFIG, 2);
                container.add(modelAxes);

                console.log('Model corrected and placed in a container. The container is now the main control object.');

                // --- KẾT THÚC THAY ĐỔI LỚN ---

                // Phần còn lại của logic GUI không cần thay đổi.
                // Nó đã được thiết kế để điều khiển `container`, nên sẽ hoạt động đúng ngay lập tức.
                const rotationInDegrees = { x: THREE.MathUtils.radToDeg(container.rotation.x), y: THREE.MathUtils.radToDeg(container.rotation.y), z: THREE.MathUtils.radToDeg(container.rotation.z), };
                const updateRotationUI = () => { if (!container) return; rotationInDegrees.x = THREE.MathUtils.radToDeg(container.rotation.x); rotationInDegrees.y = THREE.MathUtils.radToDeg(container.rotation.y); rotationInDegrees.z = THREE.MathUtils.radToDeg(container.rotation.z); gui.controllers.forEach(controller => controller.updateDisplay()); };
                const rotationFolder = gui.addFolder('Kiểm soát góc xoay (Euler)');
                rotationFolder.add(rotationInDegrees, 'x', -180, 360, 1).name('X (rX) °').onChange(value => { if (container) container.rotation.x = THREE.MathUtils.degToRad(value); });
                rotationFolder.add(rotationInDegrees, 'y', -180, 180, 1).name('Y (rY) °').onChange(value => { if (container) container.rotation.y = THREE.MathUtils.degToRad(value); });
                rotationFolder.add(rotationInDegrees, 'z', -180, 180, 1).name('Z (rZ) °').onChange(value => { if (container) container.rotation.z = THREE.MathUtils.degToRad(value); });
                rotationFolder.open();
                const localRotationFolder = gui.addFolder('Xoay theo trục cục bộ (Local)');
                const rotationParams = { angle: 15, rotateOnLocalAxis: (axis) => { if (!container) return; const angleRad = THREE.MathUtils.degToRad(rotationParams.angle); if (axis === 'x') container.rotateX(angleRad); else if (axis === 'y') container.rotateY(angleRad); else if (axis === 'z') container.rotateZ(angleRad); updateRotationUI(); } };
                localRotationFolder.add(rotationParams, 'angle', -180, 180, 1).name('Góc xoay (°)')
                localRotationFolder.add({ rotateX: () => rotationParams.rotateOnLocalAxis('x') }, 'rotateX').name('Xoay quanh rX');
                localRotationFolder.add({ rotateY: () => rotationParams.rotateOnLocalAxis('y') }, 'rotateY').name('Xoay quanh rY');
                localRotationFolder.add({ rotateZ: () => rotationParams.rotateOnLocalAxis('z') }, 'rotateZ').name('Xoay quanh rZ');
                localRotationFolder.open();
                updateRotationUI();
            },
            undefined,
            (error) => console.error('Error loading model:', error)
        );

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

export default ModelViewer;