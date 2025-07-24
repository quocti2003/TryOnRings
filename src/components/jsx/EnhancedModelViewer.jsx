// src/components/jsx/EnhancedModelViewer.jsx

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { modelLoader } from '../../utils/modelLoader.js';
import RingEnhancer from '../../utils/RingEnhancer.js';

const styles = {
    viewerContainer: {
        width: '100%',
        maxWidth: '800px',
        margin: '2rem auto',
        padding: '1rem',
        backgroundColor: '#1a1a1a',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        color: '#e0e0e0',
        fontFamily: 'sans-serif',
    },
    viewerTitle: {
        marginTop: 0,
        marginBottom: '1rem',
        fontSize: '1.5rem',
        fontWeight: 600,
        color: '#ffffff',
    },
    viewerMount: {
        width: '100%',
        height: '60vh',
        minHeight: '400px',
        position: 'relative',
        backgroundColor: '#242424',
        borderRadius: '6px',
        overflow: 'hidden',
    },
    viewerOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        color: 'white',
        fontSize: '1.2rem',
        pointerEvents: 'none',
        zIndex: 10,
    },
    viewerError: {
        color: '#ff6b6b',
        marginTop: '0.5rem',
        fontWeight: 'bold',
    },
    viewerInstructions: {
        marginTop: '1rem',
        fontSize: '0.9rem',
        color: '#a0a0a0',
    }
};

const EnhancedModelViewer = ({ modelUrl = '/models/demo-ring.glb', modelName = 'Demo Ring' }) => {
    const mountRef = useRef(null);
    const [status, setStatus] = useState('Đang khởi tạo...');
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!modelUrl) return;

        let isCancelled = false;
        const threeObjects = { renderer: null, scene: null, camera: null, controls: null, animationFrameId: null };

        const init = async () => {
            if (!mountRef.current || isCancelled) return;
            const mountPoint = mountRef.current;

            // --- THIẾT LẬP CƠ BẢN ---
            threeObjects.scene = new THREE.Scene();
            threeObjects.camera = new THREE.PerspectiveCamera(50, mountPoint.clientWidth / mountPoint.clientHeight, 0.1, 100);
            threeObjects.camera.position.z = 3;

            threeObjects.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            threeObjects.renderer.setSize(mountPoint.clientWidth, mountPoint.clientHeight);
            threeObjects.renderer.setPixelRatio(window.devicePixelRatio);
            threeObjects.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            threeObjects.renderer.outputColorSpace = THREE.SRGBColorSpace;
            mountPoint.appendChild(threeObjects.renderer.domElement);

            threeObjects.controls = new OrbitControls(threeObjects.camera, threeObjects.renderer.domElement);
            threeObjects.controls.enableDamping = true;
            threeObjects.controls.autoRotate = true;

            // --- WORKFLOW TẢI VÀ LÀM ĐẸP ---
            try {
                setStatus('Đang tải môi trường ánh sáng...');
                const enhancer = new RingEnhancer(threeObjects.renderer);
                await enhancer.init('/hdr/photo_studio_01_4k.hdr');
                enhancer.applyToScene(threeObjects.scene);

                setStatus('Đang tải mô hình nhẫn...');
                const rawRingContainer = await modelLoader(modelUrl);

                setStatus('Đang tối ưu hóa vật liệu...');
                const enhancedRing = enhancer.enhanceModel(rawRingContainer);

                enhancedRing.scale.set(1.5, 1.5, 1.5);
                threeObjects.scene.add(enhancedRing);
                setStatus('');

            } catch (err) {
                if (isCancelled) return;
                console.error("Lỗi trong quá trình tải và làm đẹp:", err);
                setError("Không thể hiển thị mô hình. Xem Console để biết chi tiết.");
                setStatus('');
                return;
            }

            // --- Vòng lặp animation ---
            const animate = () => {
                if (isCancelled) return;
                threeObjects.animationFrameId = requestAnimationFrame(animate);
                threeObjects.controls.update();
                threeObjects.renderer.render(threeObjects.scene, threeObjects.camera);
            };
            animate();

            const handleResize = () => {
                threeObjects.camera.aspect = mountPoint.clientWidth / mountPoint.clientHeight;
                threeObjects.camera.updateProjectionMatrix();
                threeObjects.renderer.setSize(mountPoint.clientWidth, mountPoint.clientHeight);
            };
            window.addEventListener('resize', handleResize);

            return () => window.removeEventListener('resize', handleResize);
        };

        init();

        return () => {
            isCancelled = true;
            if (threeObjects.animationFrameId) cancelAnimationFrame(threeObjects.animationFrameId);
            if (threeObjects.renderer && mountRef.current?.contains(threeObjects.renderer.domElement)) {
                mountRef.current.removeChild(threeObjects.renderer.domElement);
            }
            // Nâng cao: dispose các đối tượng three.js khác tại đây để giải phóng bộ nhớ
        };
    }, [modelUrl]);

    return (
        <div style={styles.viewerContainer}>
            <h2 style={styles.viewerTitle}>360° {modelName} Preview</h2>
            <div ref={mountRef} style={styles.viewerMount}>
                {(status || error) && (
                    <div style={styles.viewerOverlay}>
                        <p>{status}</p>
                        {error && <p style={styles.viewerError}>{error}</p>}
                    </div>
                )}
            </div>
            <p style={styles.viewerInstructions}>Kéo chuột để xoay, lăn chuột để zoom.</p>
        </div>
    );
};

export default EnhancedModelViewer;