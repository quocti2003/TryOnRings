// --- PHẦN 1: KHAI BÁO VÀ IMPORT ---
// Import các thư viện và thành phần cần thiết từ React và các thư viện khác.
import React, { useEffect, useRef, useState } from 'react';
// Import các thành phần từ thư viện @mediapipe/tasks-vision để nhận diện bàn tay.
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
// Import thư viện Three.js để xử lý đồ họa 3D.
import * as THREE from 'three';
// Import GLTFLoader để tải các mô hình 3D định dạng .gltf hoặc .glb.
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// Import file CSS để định dạng giao diện cho component.
import './BackCamera.css';
import { modelLoader } from '../../../utils/modelLoader.js';

// --- PHẦN 2: HÀM HỖ TRỢ VÀ HẰNG SỐ ---
// (Không có)

// --- PHẦN 3: ĐỊNH NGHĨA COMPONENT ---
// Định nghĩa một React functional component tên là AR1.
const AR1 = () => {
    // --- 3.1: KHỞI TẠO REF VÀ STATE ---
    const videoRef = useRef(null);
    const threeCanvasRef = useRef(null);
    const debugCanvasRef = useRef(null);
    const [loadingMessage, setLoadingMessage] = useState("Initializing...");
    const [handDetected, setHandDetected] = useState(false);
    const [capturedImage, setCapturedImage] = useState(null);
    const [error, setError] = useState(null);

    // --- 3.2: CÁC HẰNG SỐ ĐIỀU CHỈNH ---
    const SMOOTHING_FACTOR = 0.15;

    // --- 3.3: APP STATE ---
    // Sử dụng useRef để lưu trữ các đối tượng và trạng thái không cần kích hoạt re-render.
    const appState = useRef({
        handLandmarker: null,
        animationFrameId: null,
        videoStream: null,
        scene: new THREE.Scene(),
        camera: new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000),
        renderer: null,
        ringModel: null,
        fingerOccluder: null, // Vật thể 3D hình trụ để che ngón tay
        debugArrow: null,     // Mũi tên 3D để gỡ lỗi hướng
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
                runningMode: "VIDEO",
                numHands: 1,
            });
        };

        const setupThreeScene = async () => {
            setLoadingMessage("Chuẩn bị không gian 3D...");
            appState.camera.position.z = 5;
            appState.scene.add(new THREE.AmbientLight(0xffffff, 1.5));
            const dirLight = new THREE.DirectionalLight(0xffffff, 2);
            dirLight.position.set(5, 5, 5);
            appState.scene.add(dirLight);

            try {
                setLoadingMessage("Đang tải mô hình nhẫn...");
                const ringContainer = await modelLoader('/models/nhanDario.glb');
                appState.ringModel = ringContainer;
                appState.ringModel.visible = false;

                // QUAN TRỌNG: Đặt thứ tự render cho nhẫn. 
                // Nhẫn (1) sẽ được render SAU vật thể che khuất (0).
                appState.ringModel.renderOrder = 1;

                appState.scene.add(appState.ringModel);
            } catch (error) {
                console.error("Không thể tải mô hình nhẫn:", error);
                throw new Error("Không thể tải mô hình nhẫn. Vui lòng kiểm tra đường dẫn và file.");
            }

            // ===================================================================
            // === TẠO VẬT THỂ CHE KHUẤT (FINGER OCCLUDER) ===
            // ===================================================================
            setLoadingMessage("Tạo vật thể che khuất...");

            // 1. Tạo hình dạng (Geometry) cho ngón tay.
            const occluderGeometry = new THREE.CylinderGeometry(1, 1, 1, 32);

            // SỬA LỖI QUAN TRỌNG:
            // CylinderGeometry mặc định có trục chính là trục Y (0,1,0).
            // Ta xoay nó để trục chính nằm dọc theo trục Z (0,0,1).
            // Điều này làm cho logic xoay trong processFrame (setFromUnitVectors) hoạt động chính xác.
            occluderGeometry.rotateX(Math.PI / 2);

            // 2. Tạo vật liệu (Material) đặc biệt.
            const occluderMaterial = new THREE.MeshBasicMaterial({
                // ---- CHẾ ĐỘ GỠ LỖI ----
                // Tạm thời để màu đỏ và dạng lưới để nhìn thấy và canh chỉnh.
                // color: 0xff0000,
                // wireframe: true,
                // transparent: true,

                // ---- CHẾ ĐỘ HOÀN THIỆN ----
                // Sau khi gỡ lỗi xong, hãy comment 2 dòng trên và bỏ comment 2 dòng dưới.
                colorWrite: false, // Không vẽ màu sắc ra màn hình (làm nó tàng hình).
                depthWrite: true,  // Vẫn ghi thông tin chiều sâu để che các vật thể phía sau.
                depthTest: true,
                transparent: false,
                blending: THREE.NoBlending,
            });

            // 3. Tạo Mesh và lưu vào appState.
            appState.fingerOccluder = new THREE.Mesh(occluderGeometry, occluderMaterial);

            // 4. Đặt thứ tự render (Render Order). Occluder (0) phải được render TRƯỚC chiếc nhẫn (1).
            appState.fingerOccluder.renderOrder = 0;

            // 5. Thêm occluder vào scene và ẩn đi lúc đầu.
            appState.fingerOccluder.visible = false;
            appState.scene.add(appState.fingerOccluder);

            // =======================================================
            // === TẠO MŨI TÊN GỠ LỖI (DEBUG ARROW) ===
            // =======================================================
            appState.debugArrow = new THREE.ArrowHelper(
                new THREE.Vector3(0, 1, 0), // Hướng ban đầu
                new THREE.Vector3(0, 0, 0), // Gốc ban đầu
                1,                          // Chiều dài
                0xffff00                    // Màu vàng
            );
            appState.debugArrow.visible = false;
            // appState.scene.add(appState.debugArrow);
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

        if (!capturedImage) {
            initialize();
        }

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

    // --- PHẦN 5: CÁC HÀM XỬ LÝ SỰ KIỆN ---
    const capturePhoto = () => {
        const video = videoRef.current;
        const threeCanvas = threeCanvasRef.current;
        const debugCanvas = debugCanvasRef.current;
        if (!video || !threeCanvas || !debugCanvas) return;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = video.videoWidth;
        tempCanvas.height = video.videoHeight;
        const ctx = tempCanvas.getContext('2d');
        ctx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
        ctx.drawImage(threeCanvas, 0, 0, tempCanvas.width, tempCanvas.height);
        // Tắt lớp vẽ debug khi chụp ảnh để ảnh cuối cùng được sạch sẽ
        // ctx.drawImage(debugCanvas, 0, 0, tempCanvas.width, tempCanvas.height);

        setCapturedImage(tempCanvas.toDataURL('image/png'));
    };

    const retakePhoto = () => setCapturedImage(null);
    const handleClose = () => console.log("Close clicked");
    const handleRetry = () => {
        setError(null);
        setCapturedImage(null);
    };
    const downloadPhoto = () => {
        if (!capturedImage) return;
        const link = document.createElement('a');
        link.download = `ring-try-on-${Date.now()}.png`;
        link.href = capturedImage;
        link.click();
    };

    // --- PHẦN 6: RENDER GIAO DIỆN JSX ---
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
                    {!error && !capturedImage && (
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

export default AR1;