// --- PHẦN 1: KHAI BÁO VÀ IMPORT ---
import React, { useEffect, useRef, useState } from 'react';
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import './BackCamera.css';
import { modelLoader } from '../../../utils/modelLoader.js';
// ADDED: Import thư viện làm đẹp nhẫn
import { SimpleRingEnhancer } from '../../../utils/SimpleRingEnhancer.js';

// --- PHẦN 2: ĐỊNH NGHĨA COMPONENT ---
// MODIFIED: Đổi tên component thành Refined2
const Refined2 = () => {
    // --- 3.1: KHỞI TẠO REF VÀ STATE (Giữ nguyên từ AR1) ---
    const videoRef = useRef(null);
    const threeCanvasRef = useRef(null);
    const debugCanvasRef = useRef(null);
    const [loadingMessage, setLoadingMessage] = useState("Initializing...");
    const [handDetected, setHandDetected] = useState(false);
    const [capturedImage, setCapturedImage] = useState(null);
    const [error, setError] = useState(null);

    // --- 3.2: CÁC HẰNG SỐ ĐIỀU CHỈNH (Giữ nguyên từ AR1) ---
    const SMOOTHING_FACTOR = 0.15;

    // --- 3.3: APP STATE (Giữ nguyên từ AR1) ---
    const appState = useRef({
        handLandmarker: null,
        animationFrameId: null,
        videoStream: null,
        scene: new THREE.Scene(),
        camera: new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000),
        renderer: null,
        ringModel: null,
        fingerOccluder: null,
        debugArrow: null,
        math: { /* ... */ }
    }).current;

    // --- PHẦN 4: useEffect (Cấu trúc của AR1) ---
    useEffect(() => {
        let isCancelled = false;

        const initialize = async () => {
            setError(null);
            try {
                if (isCancelled) return;
                await setupMediaPipe();
                if (isCancelled) return;
                await setupThreeScene(); // <-- Logic làm đẹp sẽ được thêm vào hàm này
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
            appState.camera.position.z = 5;

            // MODIFIED: Sử dụng hệ thống ánh sáng tốt hơn để làm nổi bật nhẫn đã được làm đẹp
            appState.scene.add(new THREE.AmbientLight(0xffffff, 1.8));
            const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
            dirLight.position.set(3, 10, 7);
            appState.scene.add(dirLight);
            const fillLight = new THREE.DirectionalLight(0xffffff, 1.0);
            fillLight.position.set(-3, 5, -7);
            appState.scene.add(fillLight);


            // ===================================================================
            // === MODIFIED: TẢI VÀ LÀM ĐẸP MÔ HÌNH NHẪN ===
            // ===================================================================
            try {
                setLoadingMessage("Đang tải mô hình nhẫn...");
                const ringContainer = await modelLoader('/models/demo-ring.glb');

                // ADDED: Các bước làm đẹp nhẫn
                setLoadingMessage("Làm đẹp mô hình...");
                // Cần có renderer trước khi làm đẹp, sẽ khởi tạo ở startWebcam, nhưng ta có thể giả định nó sẽ có
                // Chuyển renderer vào đây để enhancer có thể sử dụng
                if (!appState.renderer) {
                    appState.renderer = new THREE.WebGLRenderer({ canvas: threeCanvasRef.current, antialias: true, alpha: true, depth: true, logarithmicDepthBuffer: true, sortObjects: false });
                }
                const enhancer = new SimpleRingEnhancer(appState.renderer);
                await enhancer.init(); // Khởi tạo môi trường, v.v.
                appState.ringModel = enhancer.enhance(ringContainer); // Áp dụng vật liệu mới
                enhancer.applyEnvironment(appState.scene); // Thêm môi trường phản chiếu vào scene

                appState.ringModel.visible = false;
                appState.ringModel.renderOrder = 1; // Giữ nguyên render order
                appState.scene.add(appState.ringModel);

            } catch (error) {
                console.error("Không thể tải hoặc làm đẹp mô hình nhẫn:", error);
                throw new Error("Không thể tải hoặc làm đẹp mô hình nhẫn.");
            }

            // ===================================================================
            // === TẠO VẬT THỂ CHE KHUẤT (Giữ nguyên từ AR1) ===
            // ===================================================================
            setLoadingMessage("Tạo vật thể che khuất...");
            const occluderGeometry = new THREE.CylinderGeometry(1, 1, 1, 32);
            occluderGeometry.rotateX(Math.PI / 2);
            const occluderMaterial = new THREE.MeshBasicMaterial({
                colorWrite: false,
                depthWrite: true,
            });
            appState.fingerOccluder = new THREE.Mesh(occluderGeometry, occluderMaterial);
            appState.fingerOccluder.renderOrder = 0;
            appState.fingerOccluder.visible = false;
            appState.scene.add(appState.fingerOccluder);
        };

        // Các hàm còn lại giữ nguyên cấu trúc từ AR1
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
                    threeCanvasRef.current.width = vW;
                    threeCanvasRef.current.height = vH;
                    debugCanvasRef.current.width = vW;
                    debugCanvasRef.current.height = vH;
                    appState.camera.aspect = vW / vH;
                    appState.camera.updateProjectionMatrix();
                    appState.renderer = new THREE.WebGLRenderer({ canvas: threeCanvasRef.current, antialias: true, alpha: true, depth: true, logarithmicDepthBuffer: true, sortObjects: false });
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
        const processFrame = (results) => {
            const { ringModel, fingerOccluder, debugArrow, camera, renderer, scene } = appState;
            const debugCtx = debugCanvasRef.current.getContext('2d');

            renderer.clear();
            renderer.clearDepth();
            debugCtx.clearRect(0, 0, debugCanvasRef.current.width, debugCanvasRef.current.height);

            const isHandVisible = results.landmarks?.length > 0 && results.handedness?.length > 0;
            setHandDetected(isHandVisible);

            // Cập nhật trạng thái hiển thị của tất cả các đối tượng 3D
            if (ringModel) ringModel.visible = isHandVisible;
            if (fingerOccluder) fingerOccluder.visible = false;
            if (debugArrow) debugArrow.visible = isHandVisible;

            if (isHandVisible) {
                const landmarks = results.landmarks[0];
                const hand = results.handedness[0][0].categoryName;
                const canvasWidth = debugCanvasRef.current.width;
                const canvasHeight = debugCanvasRef.current.height;

                // --- TÍNH TOÁN HỆ TRỤC TỌA ĐỘ NGÓN TAY ---
                const p0 = new THREE.Vector3(landmarks[0].x, landmarks[0].y, landmarks[0].z);
                const p5 = new THREE.Vector3(landmarks[5].x, landmarks[5].y, landmarks[5].z);
                const p13 = new THREE.Vector3(landmarks[13].x, landmarks[13].y, landmarks[13].z);
                const p14 = new THREE.Vector3(landmarks[14].x, landmarks[14].y, landmarks[14].z);
                const p17 = new THREE.Vector3(landmarks[17].x, landmarks[17].y, landmarks[17].z);
                const yVec = new THREE.Vector3().subVectors(p14, p13).normalize();
                const vec5_0 = new THREE.Vector3().subVectors(p5, p0);
                const vec17_0 = new THREE.Vector3().subVectors(p17, p0);
                let zVecPalm = new THREE.Vector3().crossVectors(vec5_0, vec17_0);
                if (hand === 'Left') { zVecPalm.negate(); }
                zVecPalm.normalize();
                let xVec = new THREE.Vector3().crossVectors(yVec, zVecPalm).normalize();
                const fX = xVec.negate();
                const fY = yVec;
                const fZ = zVecPalm.clone().negate();

                // --- TÍNH TOÁN VỊ TRÍ & KÍCH THƯỚC ---
                const midpoint = { x: (landmarks[13].x + landmarks[14].x) / 2, y: (landmarks[13].y + landmarks[14].y) / 2 };
                const canvas = threeCanvasRef.current;
                const targetX = midpoint.x * canvas.width;
                const targetY = midpoint.y * canvas.height;
                const p13_px = new THREE.Vector2(landmarks[13].x * canvas.width, landmarks[13].y * canvas.height);
                const p9_px = new THREE.Vector2(landmarks[9].x * canvas.width, landmarks[9].y * canvas.height);
                const fingerWidthInPixels = p13_px.distanceTo(p9_px);
                const DISTANCE_FROM_CAMERA = 5;
                const fovInRadians = (camera.fov * Math.PI) / 180;
                const viewHeight = 2 * Math.tan(fovInRadians / 2) * DISTANCE_FROM_CAMERA;
                const targetScaleValue = (fingerWidthInPixels / canvas.height) * viewHeight * 0.5;
                const targetScale = new THREE.Vector3(targetScaleValue, targetScaleValue, targetScaleValue);
                const targetPosition = new THREE.Vector3(
                    (targetX / canvas.width - 0.5) * viewHeight * camera.aspect,
                    -(targetY / canvas.height - 0.5) * viewHeight,
                    -DISTANCE_FROM_CAMERA
                );

                // --- TÍNH TOÁN XOAY NHẪN ---
                const ringX = new THREE.Vector3(fX.x, -fX.y, fX.z);
                const ringY = new THREE.Vector3(fZ.x, fZ.y, -fZ.z);
                const ringZ = new THREE.Vector3(-fY.x, fY.y, fY.z);
                const rotationMatrix = new THREE.Matrix4().makeBasis(ringX, ringY, ringZ);
                const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(rotationMatrix);

                // --- ÁP DỤNG BIẾN ĐỔI CHO NHẪN ---
                if (ringModel) {
                    ringModel.position.lerp(targetPosition, SMOOTHING_FACTOR);
                    ringModel.quaternion.slerp(targetQuaternion, SMOOTHING_FACTOR);
                    ringModel.scale.lerp(targetScale, SMOOTHING_FACTOR);
                }

                // ===================================================================
                // === CẬP NHẬT VẬT THỂ CHE KHUẤT (FINGER OCCLUDER) ===
                // ===================================================================
                if (fingerOccluder) {
                    // 1. VỊ TRÍ: Đặt occluder vào cùng vị trí đã làm mịn của nhẫn.
                    fingerOccluder.position.copy(ringModel.position);

                    // 2. HƯỚNG: Xoay occluder để nó cùng hướng với ngón tay (vector fY).
                    // Hướng mặc định của hình trụ (sau khi xoay ở setup) là Z (0,0,1).
                    const defaultDirection = new THREE.Vector3(0, 0, 1);
                    const targetDirection = fY.clone().negate(); // Hướng mục tiêu là hướng của ngón tay
                    const occluderQuaternion = new THREE.Quaternion().setFromUnitVectors(defaultDirection, targetDirection);
                    fingerOccluder.quaternion.copy(occluderQuaternion);

                    // 3. KÍCH THƯỚC: Điều chỉnh scale để hình trụ khớp với ngón tay.
                    const fingerRadius = targetScaleValue * 0.7; // Bán kính lớn hơn lỗ nhẫn một chút
                    const fingerLength = targetScaleValue * 1.65;   // Chiều dài đủ để che hết nhẫn
                    fingerOccluder.scale.set(fingerRadius, fingerRadius, fingerLength);
                }

                // ===================================================================
                // === CẬP NHẬT MŨI TÊN GỠ LỖI (DEBUG ARROW) ===
                // ===================================================================
                if (debugArrow) {
                    debugArrow.position.copy(ringModel.position);
                    debugArrow.setDirection(fY.clone()); // Cho mũi tên chỉ theo hướng ngón tay (fY)
                    debugArrow.setLength(targetScaleValue * 4, 0.5, 0.2); // Điều chỉnh kích thước cho dễ nhìn
                }

                // --- VẼ DEBUG 2D TRÊN CANVAS ---
                const originPx = { x: midpoint.x * canvasWidth, y: midpoint.y * canvasHeight };
                const AXIS_THICKNESS = 2, AXIS_LENGTH = 50, ARROW_LENGTH = 10, ARROW_ANGLE = Math.PI / 6, ORIGIN_POINT_SIZE = 5;
                debugCtx.lineWidth = AXIS_THICKNESS;
                debugCtx.lineCap = 'round';
                const drawAxisWithArrow = (vec, color, label) => {
                    const endPx = { x: originPx.x + vec.x * AXIS_LENGTH, y: originPx.y + vec.y * AXIS_LENGTH };
                    debugCtx.strokeStyle = color;
                    debugCtx.beginPath(); debugCtx.moveTo(originPx.x, originPx.y); debugCtx.lineTo(endPx.x, endPx.y); debugCtx.stroke();
                    const angle = Math.atan2(endPx.y - originPx.y, endPx.x - originPx.x);
                    debugCtx.beginPath(); debugCtx.moveTo(endPx.x, endPx.y); debugCtx.lineTo(endPx.x - ARROW_LENGTH * Math.cos(angle - ARROW_ANGLE), endPx.y - ARROW_LENGTH * Math.sin(angle - ARROW_ANGLE)); debugCtx.stroke();
                    debugCtx.beginPath(); debugCtx.moveTo(endPx.x, endPx.y); debugCtx.lineTo(endPx.x - ARROW_LENGTH * Math.cos(angle + ARROW_ANGLE), endPx.y - ARROW_LENGTH * Math.sin(angle + ARROW_ANGLE)); debugCtx.stroke();
                    debugCtx.fillStyle = color; debugCtx.font = 'bold 16px Arial'; debugCtx.fillText(label, endPx.x + vec.x * 10, endPx.y + vec.y * 10);
                };
                // drawAxisWithArrow(fX, 'rgb(255, 0, 0)', 'fX');
                // drawAxisWithArrow(fY, 'rgb(0, 255, 0)', 'fY');
                // drawAxisWithArrow(fZ, 'rgb(0, 0, 255)', 'fZ');
                debugCtx.fillStyle = 'yellow'; debugCtx.beginPath(); debugCtx.arc(originPx.x, originPx.y, ORIGIN_POINT_SIZE, 0, 2 * Math.PI); debugCtx.fill();
            }

            renderer.render(scene, camera);
        };

        // Đoạn code cho startWebcam và các hàm khác từ AR1 để bạn dễ copy-paste
        const originalStartWebcam = async () => {
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
                    threeCanvasRef.current.width = vW;
                    threeCanvasRef.current.height = vH;
                    if (debugCanvasRef.current) {
                        debugCanvasRef.current.width = vW;
                        debugCanvasRef.current.height = vH;
                    }
                    appState.camera.aspect = vW / vH;
                    appState.camera.updateProjectionMatrix();
                    // Khởi tạo renderer nếu chưa có
                    if (!appState.renderer) {
                        appState.renderer = new THREE.WebGLRenderer({ canvas: threeCanvasRef.current, antialias: true, alpha: true, depth: true, logarithmicDepthBuffer: true, sortObjects: false });
                    }
                    appState.renderer.setSize(vW, vH);
                    appState.renderer.setPixelRatio(window.devicePixelRatio);
                    resolve();
                };
            });
        };
        // Gán lại để sử dụng
        startWebcam = originalStartWebcam;


        const originalStartAnimationLoop = () => {
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
        startAnimationLoop = originalStartAnimationLoop;


        const originalProcessFrame = (results) => {
            const { ringModel, fingerOccluder, camera, renderer, scene } = appState;
            const debugCtx = debugCanvasRef.current.getContext('2d');

            renderer.clear();
            renderer.clearDepth();
            debugCtx.clearRect(0, 0, debugCanvasRef.current.width, debugCanvasRef.current.height);

            const isHandVisible = results.landmarks?.length > 0 && results.handedness?.length > 0;
            setHandDetected(isHandVisible);

            if (ringModel) ringModel.visible = isHandVisible;
            if (fingerOccluder) fingerOccluder.visible = isHandVisible; // Hiển thị occluder khi thấy tay

            if (isHandVisible) {
                const landmarks = results.landmarks[0];
                const hand = results.handedness[0][0].categoryName;

                const p0 = new THREE.Vector3(landmarks[0].x, landmarks[0].y, landmarks[0].z);
                const p5 = new THREE.Vector3(landmarks[5].x, landmarks[5].y, landmarks[5].z);
                const p13 = new THREE.Vector3(landmarks[13].x, landmarks[13].y, landmarks[13].z);
                const p14 = new THREE.Vector3(landmarks[14].x, landmarks[14].y, landmarks[14].z);
                const p17 = new THREE.Vector3(landmarks[17].x, landmarks[17].y, landmarks[17].z);
                const yVec = new THREE.Vector3().subVectors(p14, p13).normalize();
                const vec5_0 = new THREE.Vector3().subVectors(p5, p0);
                const vec17_0 = new THREE.Vector3().subVectors(p17, p0);
                let zVecPalm = new THREE.Vector3().crossVectors(vec5_0, vec17_0);
                if (hand === 'Left') { zVecPalm.negate(); }
                zVecPalm.normalize();
                let xVec = new THREE.Vector3().crossVectors(yVec, zVecPalm).normalize();
                const fX = xVec.negate();
                const fY = yVec;
                const fZ = zVecPalm.clone().negate();

                const midpoint = { x: (landmarks[13].x + landmarks[14].x) / 2, y: (landmarks[13].y + landmarks[14].y) / 2 };
                const canvas = threeCanvasRef.current;
                const p13_px = new THREE.Vector2(landmarks[13].x * canvas.width, landmarks[13].y * canvas.height);
                const p9_px = new THREE.Vector2(landmarks[9].x * canvas.width, landmarks[9].y * canvas.height);
                const fingerWidthInPixels = p13_px.distanceTo(p9_px);

                const DISTANCE_FROM_CAMERA = 5;
                const fovInRadians = (camera.fov * Math.PI) / 180;
                const viewHeight = 2 * Math.tan(fovInRadians / 2) * DISTANCE_FROM_CAMERA;
                const targetScaleValue = (fingerWidthInPixels / canvas.height) * viewHeight * 0.5;
                const targetScale = new THREE.Vector3(targetScaleValue, targetScaleValue, targetScaleValue);
                const targetPosition = new THREE.Vector3(
                    (midpoint.x - 0.5) * viewHeight * camera.aspect,
                    -(midpoint.y - 0.5) * viewHeight,
                    -DISTANCE_FROM_CAMERA
                );

                const ringX = new THREE.Vector3(fX.x, -fX.y, fX.z);
                const ringY = new THREE.Vector3(fZ.x, fZ.y, -fZ.z);
                const ringZ = new THREE.Vector3(-fY.x, fY.y, fY.z);
                const rotationMatrix = new THREE.Matrix4().makeBasis(ringX, ringY, ringZ);
                const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(rotationMatrix);

                if (ringModel) {
                    ringModel.position.lerp(targetPosition, SMOOTHING_FACTOR);
                    ringModel.quaternion.slerp(targetQuaternion, SMOOTHING_FACTOR);
                    ringModel.scale.lerp(targetScale, SMOOTHING_FACTOR);
                }

                if (fingerOccluder) {
                    fingerOccluder.position.copy(ringModel.position);
                    const defaultDirection = new THREE.Vector3(0, 0, 1);
                    const targetDirection = fY.clone().negate();
                    const occluderQuaternion = new THREE.Quaternion().setFromUnitVectors(defaultDirection, targetDirection);
                    fingerOccluder.quaternion.copy(occluderQuaternion);
                    const fingerRadius = targetScaleValue * 0.7;
                    const fingerLength = targetScaleValue * 1.65;
                    fingerOccluder.scale.set(fingerRadius, fingerRadius, fingerLength);
                }
            }
            renderer.render(scene, camera);
        };
        processFrame = originalProcessFrame;

        // Logic điều khiển khởi tạo (Giữ nguyên từ AR1)
        if (!capturedImage) {
            initialize();
        }

        // Hàm dọn dẹp (Giữ nguyên từ AR1)
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
        };
    }, [capturedImage]);

    // --- PHẦN 5: CÁC HÀM XỬ LÝ SỰ KIỆN (Giữ nguyên từ AR1) ---
    const capturePhoto = () => { /* ... Giữ nguyên code từ AR1 ... */ };
    const retakePhoto = () => setCapturedImage(null);
    const handleClose = () => console.log("Close clicked");
    const handleRetry = () => { /* ... Giữ nguyên code từ AR1 ... */ };
    const downloadPhoto = () => { /* ... Giữ nguyên code từ AR1 ... */ };

    // Đoạn code đầy đủ cho các hàm xử lý sự kiện để bạn dễ copy-paste
    const originalCapturePhoto = () => {
        const video = videoRef.current;
        const threeCanvas = threeCanvasRef.current;
        if (!video || !threeCanvas) return;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = video.videoWidth;
        tempCanvas.height = video.videoHeight;
        const ctx = tempCanvas.getContext('2d');
        ctx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
        ctx.drawImage(threeCanvas, 0, 0, tempCanvas.width, tempCanvas.height);
        setCapturedImage(tempCanvas.toDataURL('image/png'));
    };
    capturePhoto = originalCapturePhoto;

    const originalHandleRetry = () => {
        setError(null);
        setCapturedImage(null);
    };
    handleRetry = originalHandleRetry;

    const originalDownloadPhoto = () => {
        if (!capturedImage) return;
        const link = document.createElement('a');
        link.download = `ring-try-on-${Date.now()}.png`;
        link.href = capturedImage;
        link.click();
    };
    downloadPhoto = originalDownloadPhoto;

    // --- PHẦN 6: RENDER GIAO DIỆN JSX (Giữ nguyên từ AR1) ---
    return (
        <div className="mirror-container">
            <div className="camera-feed">
                {!capturedImage ? (
                    <>
                        <video ref={videoRef} className="camera-video" autoPlay playsInline muted />
                        <canvas ref={threeCanvasRef} className="detection-canvas" />
                        <canvas ref={debugCanvasRef} className="detection-canvas" style={{ pointerEvents: 'none' }} />
                    </>
                ) : (
                    <img src={capturedImage} alt="Captured" className="captured-image" />
                )}
            </div>

            <div className="ui-overlay">
                <header className="mirror-header">
                    <button onClick={handleClose} className="close-button" aria-label="Close">×</button>
                    <h1 className="mirror-title">MIRROR</h1>
                </header>
                <main className="mirror-main">
                    <p className={`instruction-text ${handDetected || loadingMessage || capturedImage || error ? 'instruction-text--hidden' : ''}`}>
                        Position your hand to start
                    </p>
                </main>
                <footer className="mirror-footer">
                    {error && !capturedImage && (
                        <div className="error-container">
                            <p className="error-text">{error}</p>
                            <button onClick={handleRetry} className="action-button">Try Again</button>
                        </div>
                    )}
                    {/* MODIFIED: Chỉ hiện nút chụp khi tay được phát hiện */}
                    {!error && !capturedImage && handDetected && (
                        <button onClick={capturePhoto} className="capture-button" aria-label="Capture photo" />
                    )}
                    {capturedImage && (
                        <div className="action-buttons-container">
                            <button onClick={retakePhoto} className="action-button">Retake</button>
                            <button onClick={downloadPhoto} className="action-button">Download</button>
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

export default Refined2;