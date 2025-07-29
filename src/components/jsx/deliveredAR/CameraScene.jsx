// --- PHẦN 1: KHAI BÁO VÀ IMPORT ---
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import * as THREE from 'three';
import { modelLoader } from '../../../utils/modelLoader.js';
import { SimpleRingEnhancer } from '../../../utils/SimpleRingEnhancer.js';
import { SimpleRingEnhancer1 } from '../../../utils/SimpleRingEnhancer1.js';
import './CameraScene.css';

// Dữ liệu ngón tay - Giữ lại để debug canvas hoạt động
const FINGER_DATA_2D = [
    { name: "Thumb", indices: [2, 3], color: "red" },
    { name: "Index", indices: [5, 6], color: "#00BFFF" },
    { name: "Middle", indices: [9, 10], color: "#FFD700" },
    { name: "Ring", indices: [13, 14], color: "#32CD32" },
    { name: "Pinky", indices: [17, 18], color: "#FF1493" },
];

const FINGER_GEOMETRY_DATA = {
    "Ring": {
        positionLandmarks: [13, 14],
        widthLandmarks: [13, 9]
    },
    "Middle": {
        positionLandmarks: [9, 10],
        widthLandmarks: [9, 5]
    },
    "Index": {
        positionLandmarks: [5, 6],
        widthLandmarks: [5, 9]
    },
    "Pinky": {
        positionLandmarks: [17, 18],
        widthLandmarks: [17, 13]
    },
    "Thumb": {
        positionLandmarks: [2, 3],
        widthLandmarks: [2, 3]
    }
};

const SMOOTHING_FACTOR = 0.25;
const TARGET_FPS = 30;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

// --- COMPONENT CHÍNH ---
const CameraScene = () => {
    const [loadingMessage, setLoadingMessage] = useState("Loading...");
    const [capturedImage, setCapturedImage] = useState(null);
    const [error, setError] = useState(null);
    const [selectedFinger, setSelectedFinger] = useState("Ring");
    const [isProcessing, setIsProcessing] = useState(false);

    const videoRef = useRef(null);
    const debugCanvasRef = useRef(null);
    const threeCanvasRef = useRef(null);
    const handLandmarkerRef = useRef(null);
    const animationFrameIdRef = useRef(null);
    const selectedFingerRef = useRef(selectedFinger);
    const lastFrameTimeRef = useRef(0);
    const isInitializedRef = useRef(false);

    const threeState = useRef({
        renderer: null,
        scene: null,
        camera: null,
        ringModel: null,
        stream: null
    }).current;

    useEffect(() => { selectedFingerRef.current = selectedFinger; }, [selectedFinger]);

    // Cleanup function
    const cleanup = useCallback(() => {
        console.log("🧹 Cleanup được gọi");
        if (animationFrameIdRef.current) {
            cancelAnimationFrame(animationFrameIdRef.current);
            animationFrameIdRef.current = null;
        }
        if (threeState.stream) {
            threeState.stream.getTracks().forEach(track => track.stop());
            threeState.stream = null;
        }
        if (threeState.renderer) {
            threeState.renderer.dispose();
            threeState.renderer.forceContextLoss();
            threeState.renderer = null;
        }
        isInitializedRef.current = false;
        handLandmarkerRef.current = null;
        console.log("✅ Cleanup hoàn tất");
    }, [threeState]);

    useEffect(() => {
        let isCancelled = false;

        const initialize = async () => {
            if (isInitializedRef.current || isProcessing) return;
            setIsProcessing(true);
            setError(null);
            try {
                console.log("🚀 Bắt đầu khởi tạo");
                await setupMediaPipe();
                if (isCancelled) return;
                await setupThreeScene();
                if (isCancelled) return;
                await startWebcam();
                if (isCancelled) return;
                startAnimationLoop();
                isInitializedRef.current = true;
                console.log("✅ Khởi tạo thành công");
            } catch (err) {
                if (isCancelled) return;
                console.error("❌ Khởi tạo thất bại:", err);
                setError(err.message || "Không thể khởi tạo ứng dụng.");
                setLoadingMessage("");
            } finally {
                setIsProcessing(false);
            }
        };

        const setupMediaPipe = async () => {
            setLoadingMessage("Tải mô hình nhận diện...");
            console.log("📡 Tải MediaPipe...");
            try {
                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm"
                );
                handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                        delegate: "GPU",
                    },
                    runningMode: "VIDEO",
                    numHands: 1
                });
                console.log("✅ MediaPipe loaded");
            } catch (error) {
                console.error("❌ MediaPipe failed:", error);
                throw new Error("Không thể tải mô hình AI. Kiểm tra kết nối mạng.");
            }
        };

        const setupThreeScene = async () => {
            setLoadingMessage("Chuẩn bị không gian 3D...");
            console.log("🎮 Thiết lập Three.js...");
            try {
                threeState.renderer = new THREE.WebGLRenderer({
                    canvas: threeCanvasRef.current,
                    antialias: false,
                    alpha: true,
                    preserveDrawingBuffer: true,
                    powerPreference: "high-performance",
                    stencil: false,
                    depth: true
                });
                threeState.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                threeState.renderer.shadowMap.enabled = false;
                threeState.renderer.outputColorSpace = THREE.SRGBColorSpace;

                threeState.scene = new THREE.Scene();

                // === FIX CAMERA SETUP ===
                threeState.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000);
                threeState.camera.position.set(0, 0, 5); // Đảm bảo camera ở giữa
                threeState.camera.lookAt(0, 0, 0); // Nhìn vào tâm

                threeState.scene.add(new THREE.AmbientLight(0xffffff, 1.5));
                const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
                dirLight.position.set(3, 10, 7);
                threeState.scene.add(dirLight);

                setLoadingMessage("Đang tải mô hình nhẫn...");
                const ringContainer = await modelLoader('/models/nhanDario.glb');

                if (typeof SimpleRingEnhancer1 !== 'undefined') {
                    try {
                        setLoadingMessage("Làm đẹp mô hình...");
                        const enhancer = new SimpleRingEnhancer1(threeState.renderer);
                        await enhancer.init();
                        threeState.ringModel = enhancer.enhance(ringContainer);
                        enhancer.applyEnvironment(threeState.scene);
                        console.log("✨ Ring enhanced");
                    } catch (enhanceError) {
                        console.warn("⚠️ Enhancement failed, using basic model:", enhanceError);
                        threeState.ringModel = ringContainer;
                    }
                } else {
                    console.log("📦 Using basic ring model");
                    threeState.ringModel = ringContainer;
                }

                // === FIX RING POSITIONING ===
                // Reset hoàn toàn vị trí nhẫn về tâm
                threeState.ringModel.position.set(0, 0, 0);
                threeState.ringModel.rotation.set(0, 0, 0);
                threeState.ringModel.scale.set(1.5, 1.5, 1.5);

                // Kiểm tra bounding box để đảm bảo model ở giữa
                const box = new THREE.Box3().setFromObject(threeState.ringModel);
                const center = box.getCenter(new THREE.Vector3());
                threeState.ringModel.position.sub(center); // Dịch chuyển để center thực sự ở gốc tọa độ

                threeState.ringModel.visible = false;
                threeState.scene.add(threeState.ringModel);

                console.log("✅ Three.js setup complete");
                console.log("📊 Ring position:", threeState.ringModel.position);
                console.log("📊 Ring scale:", threeState.ringModel.scale);
            } catch (error) {
                console.error("❌ Three.js setup failed:", error);
                throw new Error("Không thể tải mô hình 3D.");
            }
        };

        const startWebcam = async () => {
            setLoadingMessage("Mở camera...");
            console.log("📹 Khởi động camera...");
            try {
                const constraints = {
                    video: {
                        facingMode: 'environment',
                        width: { ideal: 1280, max: 1280 },
                        height: { ideal: 720, max: 720 },
                        frameRate: { ideal: 30, max: 30 },
                        resizeMode: 'crop-and-scale'               // Giữ khung hình gọn gàng
                    }
                };
                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                threeState.stream = stream;
                videoRef.current.srcObject = stream;
                return new Promise((resolve, reject) => {
                    const timeoutId = setTimeout(() => reject(new Error("Timeout khi tải camera")), 10000);
                    videoRef.current.onloadedmetadata = () => {
                        clearTimeout(timeoutId);
                        videoRef.current.play();

                        // === FIX CAMERA SETUP ===
                        setupCameraAndRenderer();

                        console.log("✅ Camera ready");
                        resolve();
                    };
                    videoRef.current.onerror = (err) => {
                        clearTimeout(timeoutId);
                        reject(new Error("Lỗi camera: " + err.message));
                    };
                });
            } catch (error) {
                console.error("❌ Camera failed:", error);
                throw new Error("Không thể truy cập camera. Kiểm tra quyền camera.");
            }
        };

        // === FIX CAMERA SETUP FUNCTION ===
        const setupCameraAndRenderer = () => {
            const { videoWidth: vW, videoHeight: vH } = videoRef.current;
            console.log(`📐 Video size: ${vW}x${vH}`);

            // Canvas size
            debugCanvasRef.current.width = vW;
            debugCanvasRef.current.height = vH;
            threeCanvasRef.current.width = vW;
            threeCanvasRef.current.height = vH;

            // Camera aspect ratio - quan trọng!
            threeState.camera.aspect = vW / vH;
            threeState.camera.updateProjectionMatrix();

            // Renderer size
            threeState.renderer.setSize(vW, vH, false); // false để không update CSS size
            threeState.renderer.setClearColor(0x000000, 0);

            // Đảm bảo viewport chính xác
            threeState.renderer.setViewport(0, 0, vW, vH);

            console.log("✅ Camera and renderer configured");
            console.log("📊 Camera aspect:", threeState.camera.aspect);
            console.log("📊 Renderer size:", vW, "x", vH);
        };

        const startAnimationLoop = () => {
            setLoadingMessage("");
            console.log("🎬 Bắt đầu animation loop");
            const animate = (currentTime) => {
                if (isCancelled || !isInitializedRef.current) {
                    console.log("🛑 Animation loop stopped");
                    return;
                }
                if (currentTime - lastFrameTimeRef.current < FRAME_INTERVAL) {
                    animationFrameIdRef.current = requestAnimationFrame(animate);
                    return;
                }
                lastFrameTimeRef.current = currentTime;
                try {
                    if (videoRef.current?.readyState >= 4) {
                        processFrame();
                    }
                } catch (error) {
                    console.error("❌ Frame processing error:", error);
                }
                animationFrameIdRef.current = requestAnimationFrame(animate);
            };
            animationFrameIdRef.current = requestAnimationFrame(animate);
        };

        // --- Dán đoạn code này để THAY THẾ hàm processFrame cũ ---

        const processFrame = () => {
            if (!handLandmarkerRef.current || !threeState.renderer || !videoRef.current || !threeState.camera) {
                return;
            }
            try {
                const results = handLandmarkerRef.current.detectForVideo(
                    videoRef.current,
                    performance.now()
                );

                const debugCtx = debugCanvasRef.current.getContext('2d');
                debugCtx.clearRect(0, 0, debugCanvasRef.current.width, debugCanvasRef.current.height);

                const isHandVisible = results.landmarks?.length > 0;

                if (isHandVisible && threeState.ringModel) {
                    threeState.ringModel.visible = true;
                    const landmarks = results.landmarks[0];
                    const handedness = results.handedness[0][0].categoryName;
                    const canvas = threeCanvasRef.current;
                    const camera = threeState.camera;

                    // Lấy thông tin hình học của ngón tay đang được chọn
                    const fingerName = selectedFingerRef.current;
                    const fingerData = FINGER_GEOMETRY_DATA[fingerName];
                    if (!fingerData) return;

                    // Lấy các landmark cần thiết cho vị trí, kích thước, và hướng xoay
                    const posLm1 = landmarks[fingerData.positionLandmarks[0]];
                    const posLm2 = landmarks[fingerData.positionLandmarks[1]];
                    const widthLm1 = landmarks[fingerData.widthLandmarks[0]];
                    const widthLm2 = landmarks[fingerData.widthLandmarks[1]];

                    if (!posLm1 || !posLm2 || !widthLm1 || !widthLm2) {
                        threeState.ringModel.visible = false;
                        return;
                    }

                    // --- BẮT ĐẦU ÁP DỤNG LOGIC BẠN CUNG CẤP ---

                    // 1. TÍNH VỊ TRÍ TRUNG BÌNH TRÊN MÀN HÌNH (Tọa độ 0-1)
                    const ringScreenPosition = {
                        x: (posLm1.x + posLm2.x) / 2,
                        y: (posLm1.y + posLm2.y) / 2,
                    };

                    // 2. CHUYỂN ĐỔI SANG HỆ TỌA ĐỘ THIẾT BỊ CHUẨN HÓA (NDC) (-1 đến 1)
                    const worldX = ringScreenPosition.x * 2 - 1;
                    const worldY = -(ringScreenPosition.y * 2 - 1); // Y bị đảo ngược

                    // 3. TÍNH TOÁN KÍCH THƯỚC KHUNG NHÌN TẠI MỘT MẶT PHẲNG CỤ THỂ
                    // Chúng ta đặt mặt phẳng này ở Z=0, vì camera ở vị trí z > 0 và nhìn về gốc tọa độ.
                    const RING_PLANE_Z = 0;
                    // Khoảng cách từ camera đến mặt phẳng chứa nhẫn
                    const distance = camera.position.z - RING_PLANE_Z;
                    // Tính chiều cao của khung nhìn tại khoảng cách đó bằng lượng giác
                    const fovInRadians = (camera.fov * Math.PI) / 180;
                    const viewHeight = 2 * Math.tan(fovInRadians / 2) * distance;
                    const viewWidth = viewHeight * camera.aspect;

                    // 4. TÍNH VỊ TRÍ CUỐI CÙNG TRONG KHÔNG GIAN 3D
                    const targetPosition = new THREE.Vector3(
                        worldX * viewWidth / 2,
                        worldY * viewHeight / 2 + 0.1,
                        RING_PLANE_Z
                    );

                    // 5. TÍNH KÍCH THƯỚC NHẪN (SCALE)
                    // Dựa trên khoảng cách pixel giữa các khớp để đo chiều rộng ngón tay
                    const widthStartPx = new THREE.Vector2(widthLm1.x * canvas.width, widthLm1.y * canvas.height);
                    const widthEndPx = new THREE.Vector2(widthLm2.x * canvas.width, widthLm2.y * canvas.height);
                    const fingerWidthInPixels = widthStartPx.distanceTo(widthEndPx);

                    // Chuyển đổi độ rộng pixel sang đơn vị của thế giới 3D
                    const fingerWidthInWorld = (fingerWidthInPixels / canvas.width) * viewWidth;

                    // Hằng số điều chỉnh để nhẫn có kích thước phù hợp với chiều rộng ngón tay
                    // Bạn có thể cần tinh chỉnh giá trị này
                    const SCALE_ADJUSTMENT_FACTOR = handedness === "Left" ? 0.5 : 0.51;
                    const targetScaleValue = fingerWidthInWorld * SCALE_ADJUSTMENT_FACTOR;
                    const targetScale = new THREE.Vector3(targetScaleValue, targetScaleValue, targetScaleValue);

                    // 6. TÍNH HƯỚNG XOAY (ROTATION) - Rất quan trọng để nhẫn trông đúng
                    const angleRad = Math.atan2(
                        (posLm2.y - posLm1.y) * canvas.height,
                        (posLm2.x - posLm1.x) * canvas.width
                    );
                    // const targetRotationZ = angleRad + Math.PI / 2; // Xoay 90 độ để đeo vào ngón tay

                    // 7. ÁP DỤNG CÁC THAY ĐỔI VÀ LÀM MƯỢT
                    threeState.ringModel.position.lerp(targetPosition, SMOOTHING_FACTOR);
                    threeState.ringModel.scale.lerp(targetScale, SMOOTHING_FACTOR);

                    // Làm mượt góc xoay
                    // const currentRotation = threeState.ringModel.rotation;
                    // currentRotation.z = THREE.MathUtils.lerp(currentRotation.z, targetRotationZ, SMOOTHING_FACTOR);

                    // Vẽ debug 2D nếu cần
                    draw2DFeatures(debugCtx, landmarks, handedness);

                } else {
                    if (threeState.ringModel) {
                        threeState.ringModel.visible = false;
                    }
                }

                threeState.renderer.render(threeState.scene, threeState.camera);

            } catch (error) {
                console.error("❌ Process frame error:", error);
            }
        };

        const draw2DFeatures = (ctx, landmarks, handedness) => {
            try {
                const wristLandmark = landmarks[0];
                const x = wristLandmark.x * ctx.canvas.width;
                const y = wristLandmark.y * ctx.canvas.height;

                ctx.fillStyle = 'lime';
                ctx.font = 'bold 32px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 2;
                ctx.strokeText(handedness.toUpperCase(), x, y - 40);
                ctx.fillText(handedness.toUpperCase(), x, y - 40);

                FINGER_DATA_2D.forEach(finger => {
                    const lm1 = landmarks[finger.indices[0]];
                    const lm2 = landmarks[finger.indices[1]];
                    if (lm1 && lm2) {
                        const midX = ((lm1.x + lm2.x) / 2) * ctx.canvas.width;
                        const midY = ((lm1.y + lm2.y) / 2) * ctx.canvas.height;
                        ctx.beginPath();
                        ctx.arc(midX, midY, 8, 0, 2 * Math.PI);
                        ctx.fillStyle = finger.color;
                        ctx.fill();
                        ctx.strokeStyle = 'white';
                        ctx.lineWidth = 2;
                        ctx.stroke();
                        ctx.font = 'bold 16px Arial';
                        ctx.fillStyle = finger.color;
                        ctx.strokeStyle = 'black';
                        ctx.lineWidth = 3;
                        ctx.strokeText(finger.name, midX, midY - 25);
                        ctx.fillText(finger.name, midX, midY - 25);
                    }
                });

                const selectedFingerData = FINGER_DATA_2D.find(finger => finger.name === selectedFingerRef.current);
                if (selectedFingerData) {
                    const lm1 = landmarks[selectedFingerData.indices[0]];
                    const lm2 = landmarks[selectedFingerData.indices[1]];
                    if (lm1 && lm2) {
                        const midX = ((lm1.x + lm2.x) / 2) * ctx.canvas.width;
                        const midY = ((lm1.y + lm2.y) / 2) * ctx.canvas.height;
                        ctx.beginPath();
                        ctx.arc(midX, midY, 12, 0, 2 * Math.PI);
                        ctx.strokeStyle = 'yellow';
                        ctx.lineWidth = 4;
                        ctx.stroke();
                        ctx.font = 'bold 14px Arial';
                        ctx.fillStyle = 'yellow';
                        ctx.strokeStyle = 'black';
                        ctx.lineWidth = 2;
                        ctx.strokeText('SELECTED', midX, midY + 35);
                        ctx.fillText('SELECTED', midX, midY + 35);
                    }
                }
            } catch (error) {
                console.error("❌ Draw 2D features error:", error);
            }
        };

        if (!capturedImage && !isInitializedRef.current) {
            initialize();
        }

        return () => {
            isCancelled = true;
            cleanup();
        };
    }, [capturedImage, cleanup]);

    // Capture photo function
    // const capturePhoto = useCallback(() => {
    //     try {
    //         const video = videoRef.current;
    //         const threeCanvas = threeCanvasRef.current;
    //         if (!video || !threeCanvas) return;
    //         const tempCanvas = document.createElement('canvas');
    //         tempCanvas.width = video.videoWidth;
    //         tempCanvas.height = video.videoHeight;
    //         const ctx = tempCanvas.getContext('2d');
    //         ctx.drawImage(video, 0, 0);
    //         ctx.drawImage(threeCanvas, 0, 0);
    //         setCapturedImage(tempCanvas.toDataURL('image/png', 0.8));
    //         console.log("📸 Photo captured");
    //     } catch (error) {
    //         console.error("❌ Capture photo error:", error);
    //         setError("Không thể chụp ảnh. Thử lại.");
    //     }
    // }, []);

    // --- BẮT ĐẦU THAY THẾ TỪ ĐÂY ---

    const capturePhoto = useCallback(() => {
        try {
            const video = videoRef.current;
            const threeCanvas = threeCanvasRef.current;
            const debugCanvas = debugCanvasRef.current; // Lấy thêm debug canvas

            // Kiểm tra xem tất cả các element đã sẵn sàng chưa
            if (!video || !threeCanvas || !debugCanvas) {
                console.error("Một trong các element (video, threeCanvas, debugCanvas) chưa sẵn sàng.");
                setError("Không thể chụp ảnh. Vui lòng thử lại.");
                return;
            }

            // Tạo một canvas tạm để ghép ảnh
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = video.videoWidth;
            tempCanvas.height = video.videoHeight;
            const ctx = tempCanvas.getContext('2d');

            // --- BẮT ĐẦU VẼ CÁC LỚP THEO ĐÚNG THỨ TỰ ---

            // Lớp 1: Vẽ video từ camera làm nền
            ctx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);

            // Lớp 2: Vẽ canvas chứa chiếc nhẫn 3D lên trên
            ctx.drawImage(threeCanvas, 0, 0, tempCanvas.width, tempCanvas.height);

            // Lớp 3: Vẽ canvas chứa các điểm debug lên trên cùng
            ctx.drawImage(debugCanvas, 0, 0, tempCanvas.width, tempCanvas.height);

            // --- KẾT THÚC VẼ CÁC LỚP ---

            // Xuất canvas đã ghép thành ảnh dạng DataURL
            // Sử dụng chất lượng 0.9 để ảnh đẹp hơn một chút
            setCapturedImage(tempCanvas.toDataURL('image/jpeg', 0.9));
            console.log("📸 Photo captured with all layers");

        } catch (error) {
            console.error("❌ Capture photo error:", error);
            setError("Không thể chụp ảnh. Có lỗi xảy ra.");
        }
    }, []); // Dependencies để trống vì chúng ta lấy từ ref.current

    // --- KẾT THÚC THAY THẾ TẠI ĐÂY ---

    const retakePhoto = useCallback(() => {
        setCapturedImage(null);
        console.log("🔄 Retaking photo");
    }, []);

    const downloadPhoto = useCallback(() => {
        if (!capturedImage) return;
        try {
            const link = document.createElement('a');
            link.download = `hand-ring-photo-${Date.now()}.png`;
            link.href = capturedImage;
            link.click();
            console.log("💾 Photo downloaded");
        } catch (error) {
            console.error("❌ Download error:", error);
        }
    }, [capturedImage]);

    const handleRetry = useCallback(() => {
        setError(null);
        setCapturedImage(null);
        isInitializedRef.current = false;
        console.log("🔄 Retrying initialization");
    }, []);

    const handleClose = useCallback(() => {
        console.log("🚪 Closing app");
        cleanup();
    }, [cleanup]);

    return (
        <div className="mirror-container">
            <div className="camera-feed">
                {!capturedImage ? (
                    <>
                        <video ref={videoRef} className="camera-video" autoPlay playsInline muted />
                        <canvas ref={threeCanvasRef} className="three-canvas" />
                        <canvas ref={debugCanvasRef} className="debug-canvas" />
                    </>
                ) : (
                    <img src={capturedImage} alt="Captured" className="captured-image" />
                )}
            </div>

            <div className="ui-overlay">
                <header className="mirror-header">
                    <button onClick={handleClose} className="close-button">×</button>
                    <h1 className="mirror-title">MIRROR</h1>
                </header>

                {!capturedImage && !error && !loadingMessage && (
                    <div className="focus-frame">
                        <div className="focus-corner top-left"></div>
                        <div className="focus-corner top-right"></div>
                        <div className="focus-corner bottom-left"></div>
                        <div className="focus-corner bottom-right"></div>
                        <p className="instruction-text">Position your hand in the frame</p>
                    </div>
                )}

                <footer className="mirror-footer">
                    {error && !capturedImage && (
                        <div className="error-container">
                            <p className="error-text">{error}</p>
                            <button onClick={handleRetry} className="action-button">Thử lại</button>
                        </div>
                    )}

                    {!error && !capturedImage && !loadingMessage && !isProcessing && (
                        <button onClick={capturePhoto} className="capture-button" />
                    )}

                    {capturedImage && (
                        <div className="action-buttons-container">
                            <button onClick={retakePhoto} className="action-button">Chụp lại</button>
                            <button onClick={downloadPhoto} className="action-button">Tải xuống</button>
                        </div>
                    )}
                </footer>

                {/* Phần chọn ngón tay giờ chỉ ảnh hưởng đến debug canvas */}
                {!error && !capturedImage && !loadingMessage && (
                    <div className="finger-select-container">
                        <select
                            className="finger-select"
                            value={selectedFinger}
                            onChange={(e) => setSelectedFinger(e.target.value)}
                            disabled={isProcessing}
                        >
                            {Object.keys(FINGER_GEOMETRY_DATA).map(fingerName => (
                                <option key={fingerName} value={fingerName}>
                                    {fingerName === 'Thumb' ? 'Ngón cái' :
                                        fingerName === 'Index' ? 'Ngón trỏ' :
                                            fingerName === 'Middle' ? 'Ngón giữa' :
                                                fingerName === 'Ring' ? 'Ngón áp út' :
                                                    fingerName === 'Pinky' ? 'Ngón út' : fingerName}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {(loadingMessage || isProcessing) && (
                <div className="loading-overlay">
                    <p className="loading-text">{loadingMessage || "Đang xử lý..."}</p>
                </div>
            )}
        </div>
    );
};

export default CameraScene;