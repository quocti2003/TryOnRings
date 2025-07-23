// src/components/jsx/lab/ModelViewer3.jsx

import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import GUI from 'lil-gui';
import { modelLoader2 } from '../../../utils/modelLoader2.js'; // Sử dụng loader đã chuẩn hóa
import { modelLoader } from '../../../utils/modelLoader.js'; // Sử dụng loader đã chuẩn hóa


// --- HÀM HELPER CHO TRỤC TỌA ĐỘ THẾ GIỚI ---
// (Giữ nguyên, không thay đổi so với ModelViewer2)
const WORLD_AXES_CONFIG = [
    { dir: new THREE.Vector3(1, 0, 0), color: '#ff0000', text: 'X' },
    { dir: new THREE.Vector3(0, 1, 0), color: '#00ff00', text: 'Y' },
    { dir: new THREE.Vector3(0, 0, 1), color: '#0000ff', text: 'Z' }
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


const ModelViewer3 = () => {
    const mountRef = useRef(null);

    useEffect(() => {
        const currentMount = mountRef.current;
        if (!currentMount) return;

        // === SETUP SCENE, CAMERA, RENDERER, LIGHTS (Tương tự ModelViewer2) ===
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a1a);
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        currentMount.appendChild(renderer.domElement);

        const camera = new THREE.PerspectiveCamera(75, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000);
        camera.position.set(0, 2, 8);
        camera.lookAt(0, 0, 0);

        const ambientLight = new THREE.AmbientLight(0xdddddd, 0.9);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight.position.set(5, 10, 7.5);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 1024;
        directionalLight.shadow.mapSize.height = 1024;
        scene.add(directionalLight);

        const worldAxes = createLabeledAxes(5, WORLD_AXES_CONFIG, 4);
        // scene.add(worldAxes); // Thêm trục thế giới để dễ so sánh

        const planeGeometry = new THREE.PlaneGeometry(20, 20);
        const planeMaterial = new THREE.ShadowMaterial({ opacity: 0.3 });
        const plane = new THREE.Mesh(planeGeometry, planeMaterial);
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = -2;
        plane.receiveShadow = true;
        scene.add(plane);

        // === MOUSE CONTROLS (Tương tự ModelViewer2) ===
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
        gui.title("KHÔNG DÙNG - Chỉ để xem animation");

        // Biến để chứa container sau khi tải xong
        let autoRotatingContainer = null;

        // === LUỒNG TẢI MODEL CHÍNH ---
        const init = async () => {
            try {
                const modelContainer = await modelLoader('/models/demo-ring.glb');
                scene.add(modelContainer);

                // Gán container đã tải vào biến để vòng lặp animate có thể truy cập
                autoRotatingContainer = modelContainer;

                console.log('Model container loaded. Auto-rotation will start.');
            } catch (error) {
                console.error('Failed to initialize the model scene:', error);
            }
        };

        init();

        // === RESIZE & ANIMATION & CLEANUP ===
        const handleResize = () => { const width = currentMount.clientWidth; const height = currentMount.clientHeight; camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height); };
        window.addEventListener('resize', handleResize);

        let frameId = null;
        const clock = new THREE.Clock(); // Sử dụng Clock để animation mượt hơn

        const animate = () => {
            frameId = requestAnimationFrame(animate);

            // --- THAY ĐỔI CHÍNH LÀ Ở ĐÂY ---
            // Kiểm tra xem container đã được tải và gán vào biến chưa
            if (autoRotatingContainer) {
                // Lấy thời gian đã trôi qua để animation không phụ thuộc vào framerate
                const elapsedTime = clock.getElapsedTime();

                // Tự động xoay CONTAINER (đối tượng Cha)
                // Cả nhẫn, trục cục bộ và hộp bao sẽ xoay theo
                // autoRotatingContainer.rotation.x = elapsedTime * 0.5; // Xoay quanh trục Y
                // autoRotatingContainer.rotation.y = elapsedTime * 0.5; // Xoay quanh trục Y

                // autoRotatingContainer.rotation.z = elapsedTime * 0.5; // Xoay quanh trục Y

                // autoRotatingContainer.rotation.x = Math.sin(elapsedTime * 0.7) * 0.2; // Thêm chút lắc lư trên trục X
            }

            renderer.render(scene, camera);
        };

        animate();

        return () => {
            // Dọn dẹp
            gui.destroy();
            cancelAnimationFrame(frameId);
            window.removeEventListener('resize', handleResize);
            currentMount.removeEventListener('mousedown', onMouseDown);
            currentMount.removeEventListener('mousemove', onMouseMove);
            currentMount.removeEventListener('mouseup', onMouseUp);
            currentMount.removeEventListener('mouseleave', onMouseUp);
            currentMount.removeEventListener('wheel', onMouseWheel);
            if (currentMount && renderer.domElement) { currentMount.removeChild(renderer.domElement); }
            scene.traverse((child) => { if (child.isMesh) { child.geometry.dispose(); if (child.material?.dispose) { child.material.dispose(); } } });
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

export default ModelViewer3;