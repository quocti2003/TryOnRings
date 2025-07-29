// --- PHẦN 1: KHAI BÁO VÀ IMPORT ---
import React, { useEffect, useRef, useState } from 'react';
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import './BackCamera.css';
import { modelLoader } from '../../../utils/modelLoader.js';
import { SimpleRingEnhancer } from '../../../utils/SimpleRingEnhancer.js';


const Refined = () => {
    const videoRef = useRef(null);
    const threeCanvasRef = useRef(null);
    const [loadingMessage, setLoadingMessage] = useState("Initializing...");
    const [handDetected, setHandDetected] = useState(false);
    const [error, setError] = useState(null);

    const SMOOTHING_FACTOR = 0.2;

    const appState = useRef({
        handLandmarker: null,
        animationFrameId: null,
        videoStream: null,
        scene: new THREE.Scene(),
        camera: new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000),
        renderer: null,
        ringModel: null,
        math: {
            p0: new THREE.Vector3(),
            p5: new THREE.Vector3(),
            p9: new THREE.Vector3(),
            p13: new THREE.Vector3(),
            p14: new THREE.Vector3(),
            p17: new THREE.Vector3(),
            fingerDir: new THREE.Vector3(),
            palmDirX: new THREE.Vector3(),
            palmDirY: new THREE.Vector3(),
            palmNormal: new THREE.Vector3(),
            fingerX: new THREE.Vector3(),
            fingerY: new THREE.Vector3(),
            fingerZ: new THREE.Vector3(),
            midPoint: new THREE.Vector3(),
            targetScale: new THREE.Vector3(),
            targetMatrix: new THREE.Matrix4(),
            targetQuaternion: new THREE.Quaternion(),
        }
    }).current;

    useEffect(() => {
        let isCancelled = false;

        const initialize = async () => {
            setError(null);
            try {
                if (isCancelled) return;
                await setupMediaPipe();
                if (isCancelled) return;
                await setupThreeScene();
                if (isCancelled) return;
                await startWebcam();
                startAnimationLoop();
            } catch (err) {
                if (isCancelled) return;
                console.error("Initialization failed:", err);
                setError(err.message || "Không thể khởi tạo. Vui lòng kiểm tra quyền camera và thử lại.");
                setLoadingMessage("");
            }
        };

        const setupMediaPipe = async () => {
            setLoadingMessage("Tải mô hình nhận diện...");
            const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm");
            appState.handLandmarker = await HandLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                    delegate: "GPU",
                },
                runningMode: "VIDEO",
                numHands: 1,
            });
        };

        const setupThreeScene = async () => {
            setLoadingMessage("Chuẩn bị không gian 3D...");

            // === BẮT ĐẦU SỬA ĐỔI ===

            // 1. TẠO RENDERER TRƯỚC
            // Canvas đã được ref, chúng ta có thể dùng nó ngay.
            appState.renderer = new THREE.WebGLRenderer({
                canvas: threeCanvasRef.current,
                antialias: true,
                alpha: true,
                powerPreference: "default",
                stencil: false,
                depth: true
            });
            // Các cài đặt renderer khác có thể đặt ở đây nếu không phụ thuộc vào video
            appState.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            appState.renderer.shadowMap.enabled = false;
            appState.renderer.physicallyCorrectLights = false;

            // Camera vẫn được khởi tạo như cũ
            appState.camera.position.z = 5;

            // Ánh sáng...
            appState.scene.add(new THREE.AmbientLight(0xffffff, 1.8));
            const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
            dirLight.position.set(3, 10, 7);
            appState.scene.add(dirLight);
            const fillLight = new THREE.DirectionalLight(0xffffff, 1.0);
            fillLight.position.set(-3, 5, -7);
            appState.scene.add(fillLight);

            try {
                setLoadingMessage("Đang tải mô hình nhẫn...");
                const ringContainer = await modelLoader('/models/nhanDario.glb');

                setLoadingMessage("Làm đẹp mô hình...");

                // 2. TRUYỀN RENDERER VÀO ENHANCER
                // Bây giờ appState.renderer đã tồn tại
                const enhancer = new SimpleRingEnhancer(appState.renderer);

                await enhancer.init();
                appState.ringModel = enhancer.enhance(ringContainer);
                enhancer.applyEnvironment(appState.scene);
                appState.ringModel.visible = false;
                appState.scene.add(appState.ringModel);

                console.log("✅ Mô hình nhẫn đã được làm đẹp thành công với SimpleRingEnhancer");

            } catch (error) {
                console.error("Không thể tải hoặc làm đẹp mô hình nhẫn:", error);
                // ... khối fallback giữ nguyên ...
            }
            // === KẾT THÚC SỬA ĐỔI ===
        };
        const startWebcam = async () => {
            setLoadingMessage("Mở camera...");
            if (!navigator.mediaDevices?.getUserMedia) throw new Error("Trình duyệt không hỗ trợ camera.");
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            appState.videoStream = stream;
            videoRef.current.srcObject = stream;
            return new Promise((resolve) => {
                videoRef.current.onloadedmetadata = () => {
                    videoRef.current.play();
                    const { videoWidth: vW, videoHeight: vH } = videoRef.current;

                    // === BẮT ĐẦU SỬA ĐỔI ===

                    // Renderer đã tồn tại, chúng ta chỉ cần cập nhật kích thước cho nó
                    // và cho camera.
                    threeCanvasRef.current.width = vW;
                    threeCanvasRef.current.height = vH;

                    appState.renderer.setSize(vW, vH);

                    appState.camera.aspect = vW / vH;
                    appState.camera.updateProjectionMatrix();

                    // Xóa bỏ phần khởi tạo renderer ở đây

                    // === KẾT THÚC SỬA ĐỔI ===

                    resolve();
                };
            });
        };
        const startAnimationLoop = () => {
            setLoadingMessage("");
            const animate = () => {
                if (isCancelled) return;
                appState.animationFrameId = requestAnimationFrame(animate);
                if (videoRef.current?.readyState >= 4) {
                    const results = appState.handLandmarker.detectForVideo(videoRef.current, performance.now());
                    processFrame(results);
                }
            };
            animate();
        };
        const processFrame = (results) => {
            const { ringModel, camera, renderer, scene } = appState;

            renderer.clear();

            const isHandVisible = results.landmarks?.length > 0 && results.handedness?.length > 0;
            setHandDetected(isHandVisible);

            if (ringModel) ringModel.visible = isHandVisible;

            if (isHandVisible) {
                const landmarks = results.landmarks[0];
                const canvas = threeCanvasRef.current;

                // Tính điểm trung bình giữa landmark 13 và 14 (vị trí đeo nhẫn)
                const ringPosition = {
                    x: (landmarks[13].x + landmarks[14].x) / 2,
                    y: (landmarks[13].y + landmarks[14].y) / 2,
                    z: (landmarks[13].z + landmarks[14].z) / 2  // Độ sâu từ MediaPipe
                };

                // Chuyển đổi từ tọa độ normalized (0-1) sang pixel coordinates
                const pixelX = ringPosition.x * canvas.width;
                const pixelY = ringPosition.y * canvas.height;

                // Chuyển đổi từ pixel coordinates sang Three.js world coordinates
                // Three.js sử dụng hệ tọa độ với (0,0) ở giữa màn hình
                const worldX = (pixelX / canvas.width - 0.5) * 2;  // -1 đến 1
                const worldY = -(pixelY / canvas.height - 0.5) * 2; // -1 đến 1 (đảo ngược Y)

                // Tính khoảng cách Z dựa trên camera FOV
                const DISTANCE_FROM_CAMERA = 5;
                const fovInRadians = (camera.fov * Math.PI) / 180;
                const viewHeight = 2 * Math.tan(fovInRadians / 2) * DISTANCE_FROM_CAMERA;
                const viewWidth = viewHeight * camera.aspect;

                // Vị trí cuối cùng trong không gian 3D
                const targetPosition = new THREE.Vector3(
                    worldX * viewWidth / 2,
                    worldY * viewHeight / 2,
                    -DISTANCE_FROM_CAMERA
                );

                // Tính kích thước nhẫn dựa trên khoảng cách giữa các landmark
                const p13_px = new THREE.Vector2(landmarks[13].x * canvas.width, landmarks[13].y * canvas.height);
                const p14_px = new THREE.Vector2(landmarks[14].x * canvas.width, landmarks[14].y * canvas.height);
                const fingerWidthInPixels = p13_px.distanceTo(p14_px);

                // Scale tương ứng với kích thước ngón tay
                const targetScaleValue = (fingerWidthInPixels / canvas.height) * viewHeight * 0.3;
                const targetScale = new THREE.Vector3(targetScaleValue, targetScaleValue, targetScaleValue);

                // Áp dụng vị trí và kích thước cho nhẫn (bỏ rotation)
                if (ringModel) {
                    ringModel.position.lerp(targetPosition, SMOOTHING_FACTOR);
                    ringModel.scale.lerp(targetScale, SMOOTHING_FACTOR);
                    // Giữ rotation mặc định hoặc đặt rotation cố định
                    // ringModel.rotation.set(Math.PI / 3, 0, 0);
                }
            }

            renderer.render(scene, camera);
        };

        initialize();

        return () => {
            isCancelled = true;
            if (appState.animationFrameId) {
                cancelAnimationFrame(appState.animationFrameId);
                appState.animationFrameId = null;
            }
            if (appState.videoStream) {
                appState.videoStream.getTracks().forEach(track => track.stop());
                appState.videoStream = null;
            }
            // Cleanup renderer
            if (appState.renderer) {
                appState.renderer.dispose();
                appState.renderer = null;
            }
        };
    }, []);

    const handleClose = () => console.log("Close clicked");
    const handleRetry = () => {
        setError(null);
        window.location.reload();
    };

    return (
        <div className="mirror-container">
            <div className="camera-feed">
                <video ref={videoRef} className="camera-video" autoPlay playsInline muted />
                <canvas ref={threeCanvasRef} className="detection-canvas" />
            </div>

            <div className="ui-overlay">
                <header className="mirror-header">
                    <button onClick={handleClose} className="close-button" aria-label="Close">×</button>
                    <h1 className="mirror-title">MIRROR</h1>
                </header>
                <main className="mirror-main">
                    <p className={`instruction-text ${handDetected || loadingMessage || error ? 'instruction-text--hidden' : ''}`}>
                        Position your hand to start
                    </p>
                </main>
                <footer className="mirror-footer">
                    {error && (
                        <div className="error-container">
                            <p className="error-text">{error}</p>
                            <button onClick={handleRetry} className="action-button">Try Again</button>
                        </div>
                    )}
                </footer>
            </div>
            {loadingMessage && (
                <div className="loading-overlay">
                    <p className="loading-text">{loadingMessage}</p>
                </div>
            )}
        </div>
    );
};

export default Refined;