// --- PHẦN 1: KHAI BÁO VÀ IMPORT ---
import React, { useEffect, useRef, useState } from 'react';
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import * as THREE from 'three';
import './BackCamera.css';

// --- PHẦN 3: ĐỊNH NGHĨA COMPONENT ---
const AR2 = () => {
    // --- 3.1: KHỞI TẠO REF VÀ STATE ---
    const videoRef = useRef(null);
    const threeCanvasRef = useRef(null);
    const debugCanvasRef = useRef(null);
    const [loadingMessage, setLoadingMessage] = useState("Initializing...");
    const [error, setError] = useState(null);

    // --- 3.3: APP STATE ---
    const appState = useRef({
        handLandmarker: null,
        animationFrameId: null,
        videoStream: null,
        scene: new THREE.Scene(),
        camera: new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000),
        renderer: null,
        fingerOccluder: null, // Chỉ cần occluder
    }).current;

    // --- PHẦN 4: useEffect ---
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
                runningMode: "VIDEO", numHands: 1,
            });
        };

        const setupThreeScene = async () => {
            setLoadingMessage("Chuẩn bị không gian 3D...");
            const { scene, camera } = appState;
            camera.position.z = 10;
            scene.add(new THREE.AmbientLight(0xffffff, 1.5));
            const dirLight = new THREE.DirectionalLight(0xffffff, 2);
            dirLight.position.set(3, 5, 5);
            scene.add(dirLight);

            // Tăng số lượng segment để hình trụ tròn hơn
            const occluderGeometry = new THREE.CylinderGeometry(1, 1, 1, 32);
            occluderGeometry.rotateX(Math.PI / 2);
            const occluderMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
            appState.fingerOccluder = new THREE.Mesh(occluderGeometry, occluderMaterial);
            appState.fingerOccluder.visible = false;
            scene.add(appState.fingerOccluder);
        };

        const startWebcam = async () => {
            setLoadingMessage("Mở camera...");
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } });
            appState.videoStream = stream;
            videoRef.current.srcObject = stream;
            return new Promise((resolve) => {
                videoRef.current.onloadedmetadata = () => {
                    videoRef.current.play();
                    const { videoWidth: vW, videoHeight: vH } = videoRef.current;
                    threeCanvasRef.current.width = vW; threeCanvasRef.current.height = vH;
                    debugCanvasRef.current.width = vW; debugCanvasRef.current.height = vH;
                    appState.camera.aspect = vW / vH;
                    appState.camera.updateProjectionMatrix();
                    appState.renderer = new THREE.WebGLRenderer({ canvas: threeCanvasRef.current, antialias: true, alpha: true });
                    appState.renderer.setSize(vW, vH);
                    appState.renderer.setPixelRatio(window.devicePixelRatio);
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


        // =================================================================
        // === HÀM XỬ LÝ CHÍNH (KẾT HỢP Z-DEPTH ỔN ĐỊNH & SCALE ĐỘNG) ===
        // =================================================================
        const processFrame = (results) => {
            const { scene, camera, renderer, fingerOccluder } = appState;
            const debugCtx = debugCanvasRef.current.getContext('2d');
            const canvas = debugCanvasRef.current;

            debugCtx.clearRect(0, 0, canvas.width, canvas.height);

            const isHandVisible = results.landmarks?.length > 0 && results.handedness?.length > 0;
            if (fingerOccluder) fingerOccluder.visible = isHandVisible;

            if (isHandVisible) {
                const landmarks = results.landmarks[0];
                const hand = results.handedness[0][0].categoryName;

                // --- 1. TÍNH TOÁN VỊ TRÍ Z (ĐỘ SÂU) - Giữ nguyên logic cũ vì nó ổn định ---
                const REFERENCE_HAND_WIDTH_PX = 300;
                const REFERENCE_Z_DEPTH = 5;

                const wristPx = { x: landmarks[0].x * canvas.width, y: landmarks[0].y * canvas.height };
                const mcpPx = { x: landmarks[9].x * canvas.width, y: landmarks[9].y * canvas.height };
                const handSizePx = Math.sqrt(Math.pow(wristPx.x - mcpPx.x, 2) + Math.pow(wristPx.y - mcpPx.y, 2));

                // Khi handSizePx = 0 (lỗi hiếm gặp), gán một giá trị nhỏ để tránh chia cho 0
                const safeHandSizePx = handSizePx > 0 ? handSizePx : 1;
                const estimatedZ = (REFERENCE_HAND_WIDTH_PX / safeHandSizePx) * REFERENCE_Z_DEPTH;

                // --- 2. TÍNH TOÁN KÍCH THƯỚC OCCLUDER CHÍNH XÁC THEO Ý MÀY ---
                // Đo độ rộng ngón tay bằng pixel trên màn hình
                const p13_px = new THREE.Vector2(landmarks[13].x * canvas.width, landmarks[13].y * canvas.height);
                const p9_px = new THREE.Vector2(landmarks[9].x * canvas.width, landmarks[9].y * canvas.height);
                const fingerWidthInPixels = p13_px.distanceTo(p9_px);

                // Tính toán chiều rộng của viewport tại độ sâu Z đã ước tính
                const vFov = camera.fov * Math.PI / 180; // vertical fov in radians
                const viewHeightAtZ = 2 * Math.tan(vFov / 2) * estimatedZ;
                const viewWidthAtZ = viewHeightAtZ * camera.aspect;

                // "Unproject" độ rộng pixel thành độ rộng trong thế giới 3D
                // Công thức: world_width = (pixel_width / screen_width_px) * world_width_at_Z
                const occluderWidthInWorldUnits = (fingerWidthInPixels / canvas.width) * viewWidthAtZ;

                // Bán kính bằng một nửa độ rộng
                const occluderRadius = occluderWidthInWorldUnits / 2;
                // Có thể thêm một hệ số để nó vừa khít hơn
                const SCALE_ADJUSTMENT = 1.1;
                const finalRadius = occluderRadius * SCALE_ADJUSTMENT;
                const occluderLength = finalRadius * 8; // Chiều dài tỉ lệ với bán kính

                // Cập nhật scale
                fingerOccluder.scale.set(finalRadius, finalRadius, occluderLength);

                // --- 3. TÍNH TOÁN VỊ TRÍ (X, Y) VÀ HƯỚNG XOAY ---
                const midpointX = (landmarks[13].x + landmarks[14].x) / 2;
                const midpointY = (landmarks[13].y + landmarks[14].y) / 2;

                const targetPosition = new THREE.Vector3(
                    (midpointX - 0.5) * viewWidthAtZ,
                    -(midpointY - 0.5) * viewHeightAtZ,
                    -estimatedZ
                );

                // Hướng xoay
                const p13_vec = new THREE.Vector3(landmarks[13].x, landmarks[13].y, landmarks[13].z);
                const p14_vec = new THREE.Vector3(landmarks[14].x, landmarks[14].y, landmarks[14].z);
                const fY = new THREE.Vector3().subVectors(p14_vec, p13_vec).normalize();
                const three_fY = new THREE.Vector3(fY.x, -fY.y, fY.z);

                // *** CHÌM OCCLUDER VÀO TRONG NGÓN TAY ***
                // Tính vector hướng vào trong ngón tay (theo hướng fZ)
                const p0_vec = new THREE.Vector3(landmarks[0].x, landmarks[0].y, landmarks[0].z);
                const p5_vec = new THREE.Vector3(landmarks[5].x, landmarks[5].y, landmarks[5].z);
                const p17_vec = new THREE.Vector3(landmarks[17].x, landmarks[17].y, landmarks[17].z);
                const vec17_0 = new THREE.Vector3().subVectors(p17_vec, p0_vec);
                const vec5_0 = new THREE.Vector3().subVectors(p5_vec, p0_vec);
                const fZ = new THREE.Vector3().crossVectors(vec17_0, vec5_0).normalize();
                if (hand === 'Left') fZ.negate();

                // Chuyển đổi fZ sang không gian 3D (flip Y như fY)
                const three_fZ = new THREE.Vector3(fZ.x, -fZ.y, fZ.z);

                // Đẩy occluder vào trong ngón tay theo hướng fZ
                const EMBED_DEPTH = finalRadius * 1.0 // Chìm vào khoảng 80% bán kính
                const embedOffset = three_fZ.clone().multiplyScalar(EMBED_DEPTH);
                targetPosition.add(embedOffset);

                const defaultDirection = new THREE.Vector3(0, 0, 1);
                const occluderQuaternion = new THREE.Quaternion().setFromUnitVectors(defaultDirection, three_fY);

                // Cập nhật vị trí và hướng
                fingerOccluder.position.copy(targetPosition);
                fingerOccluder.quaternion.copy(occluderQuaternion);

                // --- VẼ DEBUG ---
                // Vẫn dùng các vector hướng fX, fY, fZ để vẽ debug cho chính xác
                const fX = new THREE.Vector3().crossVectors(fY, fZ).normalize();

                const originPoint = { x: midpointX * canvas.width, y: midpointY * canvas.height };
                const AXIS_THICKNESS = 3, AXIS_LENGTH = 70, ARROW_LENGTH = 12;
                const ARROW_ANGLE = Math.PI / 6, ORIGIN_POINT_SIZE = 6;
                debugCtx.lineWidth = AXIS_THICKNESS; debugCtx.lineCap = 'round';
                const drawAxisWithArrow = (vec, color, label) => {
                    const endPx = { x: originPoint.x + vec.x * AXIS_LENGTH, y: originPoint.y + vec.y * AXIS_LENGTH };
                    debugCtx.strokeStyle = color; debugCtx.fillStyle = color;
                    debugCtx.beginPath(); debugCtx.moveTo(originPoint.x, originPoint.y); debugCtx.lineTo(endPx.x, endPx.y); debugCtx.stroke();
                    const angle = Math.atan2(endPx.y - originPoint.y, endPx.x - originPoint.x);
                    debugCtx.beginPath(); debugCtx.moveTo(endPx.x, endPx.y);
                    debugCtx.lineTo(endPx.x - ARROW_LENGTH * Math.cos(angle - ARROW_ANGLE), endPx.y - ARROW_LENGTH * Math.sin(angle - ARROW_ANGLE));
                    debugCtx.moveTo(endPx.x, endPx.y);
                    debugCtx.lineTo(endPx.x - ARROW_LENGTH * Math.cos(angle + ARROW_ANGLE), endPx.y - ARROW_LENGTH * Math.sin(angle + ARROW_ANGLE));
                    debugCtx.stroke();
                    debugCtx.font = 'bold 20px Arial';
                    debugCtx.fillText(label, endPx.x + vec.x * 15, endPx.y + vec.y * 15);
                };
                drawAxisWithArrow(fX, 'rgb(255, 50, 50)', 'fX');
                drawAxisWithArrow(fY, 'rgb(50, 255, 50)', 'fY');
                drawAxisWithArrow(fZ, 'rgb(100, 100, 255)', 'fZ');
                debugCtx.fillStyle = 'yellow'; debugCtx.beginPath();
                debugCtx.arc(originPoint.x, originPoint.y, ORIGIN_POINT_SIZE, 0, 2 * Math.PI);
                debugCtx.fill(); debugCtx.strokeStyle = 'black';
                debugCtx.lineWidth = 2; debugCtx.stroke();
            }

            renderer.render(scene, camera);
        };

        initialize();

        return () => {
            isCancelled = true;
            if (appState.animationFrameId) cancelAnimationFrame(appState.animationFrameId);
            if (appState.videoStream) appState.videoStream.getTracks().forEach(track => track.stop());
        };
    }, []);

    // --- PHẦN 6: RENDER GIAO DIỆN JSX ---
    return (
        <div className="mirror-container">
            <div className="camera-feed">
                <video ref={videoRef} className="camera-video" autoPlay playsInline muted />
                <canvas ref={threeCanvasRef} className="detection-canvas" />
                <canvas ref={debugCanvasRef} className="detection-canvas" style={{ pointerEvents: 'none' }} />
            </div>
            <div className="ui-overlay">
                <header className="mirror-header"><h1 className="mirror-title">Occluder Debug</h1></header>
                <footer className="mirror-footer">
                    {error && (<div className="error-container"><p className="error-text">{error}</p></div>)}
                </footer>
            </div>
            {loadingMessage && (<div className="loading-overlay"><p className="loading-text">{loadingMessage}</p></div>)}
        </div>
    );
};

export default AR2;