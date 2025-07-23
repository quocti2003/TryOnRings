import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { modelLoader } from '../../../utils/modelLoader.js';
import { modelLoader2 } from '../../../utils/modelLoader2.js';

import './PreprocessingViewer.css';

const PreprocessingViewer = () => {
    const mountRef = useRef(null);
    const [loadingMessage, setLoadingMessage] = useState("Loading 3D Ring...");

    // MỚI: State để lưu trữ giá trị xoay từ các thanh trượt
    // Giá trị được tính bằng radian (0 đến 2*PI là một vòng quay hoàn chỉnh)
    const [rotation, setRotation] = useState({ x: 0, y: 0, z: 0 });

    const appState = useRef({
        scene: null,
        camera: null,
        renderer: null,
        ringModel: null,
        animationFrameId: null,
    }).current;

    // MỚI: Dùng một ref để giữ giá trị rotation mới nhất cho vòng lặp animation.
    // Điều này để tránh vấn đề "stale closure" trong useEffect.
    const rotationRef = useRef(rotation);
    useEffect(() => {
        rotationRef.current = rotation;
    }, [rotation]);


    useEffect(() => {
        const currentMount = mountRef.current;
        if (!currentMount) return;

        // --- BƯỚC 1: THIẾT LẬP SCENE, CAMERA, RENDERER CƠ BẢN ---
        const scene = new THREE.Scene();
        appState.scene = scene;
        scene.background = new THREE.Color(0x1a1a1a);

        const camera = new THREE.PerspectiveCamera(
            75,
            currentMount.clientWidth / currentMount.clientHeight,
            0.1,
            1000
        );
        appState.camera = camera;
        camera.position.z = 5;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        appState.renderer = renderer;
        renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        currentMount.appendChild(renderer.domElement);

        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(5, 10, 7.5);
        scene.add(dirLight);

        // --- BƯỚC 2: TẢI MÔ HÌNH ---
        const loadModelAndStart = async () => {
            try {
                const model = await modelLoader('/models/preprocess.glb');
                appState.ringModel = model;
                scene.add(model);
                setLoadingMessage("");
                animate();

            } catch (error) {
                console.error("Failed to load 3D model:", error);
                setLoadingMessage("Error loading 3D model.");
            }
        };

        // --- BƯỚC 3: VÒNG LẶP ANIMATION ---
        const animate = () => {
            // THAY ĐỔI: Thay vì tự động xoay, chúng ta sẽ đặt góc xoay
            // dựa trên giá trị từ state (thông qua ref để có giá trị mới nhất).
            if (appState.ringModel) {
                // appState.ringModel.rotation.x += 0.002; // Xóa dòng xoay tự động
                // appState.ringModel.rotation.x = rotationRef.current.x;
                // appState.ringModel.rotation.y = rotationRef.current.y;
                // appState.ringModel.rotation.z = rotationRef.current.z;
            }

            renderer.render(scene, camera);
            appState.animationFrameId = requestAnimationFrame(animate);
        };

        loadModelAndStart();

        // --- BƯỚC 4: XỬ LÝ RESIZE VÀ DỌN DẸP ---
        const handleResize = () => {
            const width = currentMount.clientWidth;
            const height = currentMount.clientHeight;
            renderer.setSize(width, height);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        };

        window.addEventListener('resize', handleResize);

        return () => {
            // Cleanup code không thay đổi...
            if (appState.animationFrameId) {
                cancelAnimationFrame(appState.animationFrameId);
            }
            window.removeEventListener('resize', handleResize);
            if (currentMount && renderer.domElement) {
                currentMount.removeChild(renderer.domElement);
            }
            if (scene) {
                scene.traverse((object) => {
                    if (object.isMesh) {
                        object.geometry.dispose();
                        if (Array.isArray(object.material)) {
                            object.material.forEach(material => material.dispose());
                        } else {
                            object.material.dispose();
                        }
                    }
                });
            }
            if (renderer) renderer.dispose();
        };
    }, [appState]);

    // MỚI: Hàm xử lý khi thanh trượt thay đổi giá trị
    const handleRotationChange = (axis, value) => {
        setRotation(prev => ({
            ...prev,
            [axis]: parseFloat(value) // Cập nhật giá trị cho trục tương ứng
        }));
    };

    return (
        <div className="mirror-container">
            <div ref={mountRef} className="three-canvas-mount" />

            {loadingMessage && (
                <div className="loading-overlay">
                    <p className="loading-text">{loadingMessage}</p>
                </div>
            )}

            {/* MỚI: Giao diện điều khiển các thanh trượt */}
            <div className="controls-overlay">
                <div className="control-group">
                    <label>Rotation X</label>
                    <input
                        type="range"
                        min="-180"
                        max={Math.PI * 2} // Một vòng quay 360 độ
                        step="0.1"
                        value={rotation.x}
                        onChange={(e) => handleRotationChange('x', e.target.value)}
                    />
                </div>
                <div className="control-group">
                    <label>Rotation Y</label>
                    <input
                        type="range"
                        min="-180"
                        max={Math.PI * 2}
                        step="0.1"
                        value={rotation.y}
                        onChange={(e) => handleRotationChange('y', e.target.value)}
                    />
                </div>
                <div className="control-group">
                    <label>Rotation Z</label>
                    <input
                        type="range"
                        min="-180"
                        max={Math.PI * 2}
                        step="0.1"
                        value={rotation.z}
                        onChange={(e) => handleRotationChange('z', e.target.value)}
                    />
                </div>
            </div>
        </div>
    );
};

export default PreprocessingViewer;