// src/components/jsx/lab/ModelViewer3.jsx (Phiên bản "HOÀN MỸ" hoàn chỉnh)

import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { modelLoader } from '../../../utils/modelLoader.js';
import { RingEnhancer } from '../../../utils/RingEnhancer.js';

// --- NHẬP CÁC MODULE HẬU KỲ ---
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// --- CSS styles for buttons ---
const buttonContainerStyle = {
    position: 'absolute',
    top: '20px',
    left: '20px',
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: '10px',
    borderRadius: '8px',
};

const buttonStyle = {
    padding: '10px 18px',
    border: '1px solid #555',
    borderRadius: '5px',
    cursor: 'pointer',
    backgroundColor: '#333',
    color: 'white',
    fontSize: '14px',
    textAlign: 'center',
    transition: 'background-color 0.2s',
};


const ModelViewer3 = () => {
    const mountRef = useRef(null);
    const [enhancerInstance, setEnhancerInstance] = useState(null);

    useEffect(() => {
        const currentMount = mountRef.current;
        if (!currentMount) return;

        // === 1. THIẾT LẬP SCENE CƠ BẢN ===
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x101010); // Nền đen sâu hơn

        const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        currentMount.appendChild(renderer.domElement);

        const camera = new THREE.PerspectiveCamera(45, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000);
        camera.position.set(0, 0, 6);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.5;
        controls.minDistance = 2;
        controls.maxDistance = 10;

        // === 2. THIẾT LẬP HẬU KỲ (POST-PROCESSING) ===
        const composer = new EffectComposer(renderer);
        const renderPass = new RenderPass(scene, camera);
        composer.addPass(renderPass);

        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.6, // strength: Cường độ hào quang
            0.1, // radius: Bán kính quầng sáng
            0.85 // threshold: Chỉ những gì sáng hơn 85% mới phát sáng
        );
        composer.addPass(bloomPass);


        // === 3. WORKFLOW TẢI VÀ LÀM ĐẸP NHẪN ===
        const initScene = async () => {
            try {
                const enhancer = new RingEnhancer(renderer);
                await enhancer.init('/hdr/photo_studio_01_4k.hdr');
                enhancer.applyEnvironment(scene);

                const rawModel = await modelLoader('/models/demo-ring.glb');
                const beautifulRing = enhancer.enhance(rawModel);

                scene.add(beautifulRing);
                setEnhancerInstance(enhancer);
            } catch (error) {
                console.error('Không thể khởi tạo scene:', error);
            }
        };
        initScene();

        // === 4. ANIMATION VÀ DỌN DẸP ===
        let animationFrameId = null;
        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);
            controls.update();
            composer.render();
        };
        animate();

        const handleResize = () => {
            const width = currentMount.clientWidth;
            const height = currentMount.clientHeight;
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
            composer.setSize(width, height);
        };
        window.addEventListener('resize', handleResize);

        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', handleResize);
            if (currentMount.contains(renderer.domElement)) {
                currentMount.removeChild(renderer.domElement);
            }
            controls.dispose();
            renderer.dispose();
            composer.dispose(); // Dọn dẹp cả composer
            scene.traverse(object => {
                if (object.geometry) object.geometry.dispose();
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            });
        };
    }, []);

    return (
        <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
            <div style={buttonContainerStyle}>
                <button
                    style={buttonStyle}
                    onMouseOver={(e) => e.target.style.backgroundColor = '#555'}
                    onMouseOut={(e) => e.target.style.backgroundColor = '#333'}
                    onClick={() => enhancerInstance?.setRoseGold()}
                >
                    Vàng Hồng
                </button>
                <button
                    style={buttonStyle}
                    onMouseOver={(e) => e.target.style.backgroundColor = '#555'}
                    onMouseOut={(e) => e.target.style.backgroundColor = '#333'}
                    onClick={() => enhancerInstance?.setGold()}
                >
                    Vàng
                </button>
                <button
                    style={buttonStyle}
                    onMouseOver={(e) => e.target.style.backgroundColor = '#555'}
                    onMouseOut={(e) => e.target.style.backgroundColor = '#333'}
                    onClick={() => enhancerInstance?.setSilver()}
                >
                    Bạc
                </button>
                <button
                    style={buttonStyle}
                    onMouseOver={(e) => e.target.style.backgroundColor = '#555'}
                    onMouseOut={(e) => e.target.style.backgroundColor = '#333'}
                    onClick={() => enhancerInstance?.setPlatinum()}
                >
                    Bạch kim
                </button>
            </div>
            <div ref={mountRef} style={{ width: '100%', height: '100%', cursor: 'grab' }} />
        </div>
    );
};

export default ModelViewer3;