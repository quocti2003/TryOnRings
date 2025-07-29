// --- PHẦN 1: KHAI BÁO VÀ IMPORT ---
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import * as THREE from 'three';
import { modelLoader } from '../../../utils/modelLoader.js';
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
const CameraScene2 = () => {
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
        handOccluder: null, // Thêm occluder vào state
        stream: null
    }).current;

    useEffect(() => { selectedFingerRef.current = selectedFinger; }, [selectedFinger]);

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
                    antialias: true,
                    alpha: true,
                    preserveDrawingBuffer: true,
                    powerPreference: "high-performance"
                });
                threeState.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                threeState.renderer.outputColorSpace = THREE.SRGBColorSpace;

                threeState.scene = new THREE.Scene();
                threeState.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000);
                threeState.camera.position.set(0, 0, 50);
                threeState.camera.lookAt(0, 0, 0);

                threeState.scene.add(new THREE.AmbientLight(0xffffff, 1.5));
                const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
                dirLight.position.set(3, 10, 7);
                threeState.scene.add(dirLight);

                // --- BẮT ĐẦU PHẦN CODE MỚI: TẠO FINGER OCCLUDER ---
                console.log("👻 Tạo Occluder hình trụ cho ngón tay...");

                // Tạo một hình trụ đơn giản. Kích thước ban đầu không quan trọng vì sẽ được cập nhật.
                // Tăng số segment để hình trụ tròn hơn.
                const fingerOccluderGeometry = new THREE.CylinderGeometry(1, 1, 1, 16);
                // Xoay hình trụ để nó nằm ngang, sẵn sàng để hướng theo ngón tay
                fingerOccluderGeometry.rotateX(Math.PI / 2);


                // Vật liệu Occluder quan trọng
                const occluderMaterial = new THREE.MeshBasicMaterial({
                    color: 0x00ff00,     // Màu xanh lá cây để dễ nhìn
                    wireframe: true,     // Bật chế độ khung dây
                    depthWrite: true     // Vẫn giữ lại chức năng che khuất
                });

                // Đổi tên từ handOccluder thành fingerOccluder
                threeState.fingerOccluder = new THREE.Mesh(fingerOccluderGeometry, occluderMaterial);
                threeState.fingerOccluder.renderOrder = -1; // Render trước nhẫn
                threeState.scene.add(threeState.fingerOccluder);
                console.log("✅ Finger Occluder đã sẵn sàng.");
                // --- KẾT THÚC PHẦN CODE MỚI ---

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

                threeState.ringModel.position.set(0, 0, 0);
                threeState.ringModel.rotation.set(0, 0, 0);
                threeState.ringModel.scale.set(1, 1, 1);

                const box = new THREE.Box3().setFromObject(threeState.ringModel);
                const center = box.getCenter(new THREE.Vector3());
                threeState.ringModel.position.sub(center);

                threeState.ringModel.visible = false;
                threeState.scene.add(threeState.ringModel);

                console.log("✅ Three.js setup complete");
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
                    }
                };
                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                threeState.stream = stream;
                videoRef.current.srcObject = stream;
                return new Promise((resolve, reject) => {
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current.play();
                        setupCameraAndRenderer();
                        console.log("✅ Camera ready");
                        resolve();
                    };
                    videoRef.current.onerror = (err) => reject(new Error("Lỗi camera: " + err.message));
                });
            } catch (error) {
                console.error("❌ Camera failed:", error);
                throw new Error("Không thể truy cập camera. Kiểm tra quyền camera.");
            }
        };

        const setupCameraAndRenderer = () => {
            const { videoWidth: vW, videoHeight: vH } = videoRef.current;
            debugCanvasRef.current.width = vW;
            debugCanvasRef.current.height = vH;
            threeCanvasRef.current.width = vW;
            threeCanvasRef.current.height = vH;

            threeState.camera.aspect = vW / vH;
            threeState.camera.updateProjectionMatrix();

            threeState.renderer.setSize(vW, vH, false);
            threeState.renderer.setClearColor(0x000000, 0);
            threeState.renderer.setViewport(0, 0, vW, vH);
            console.log("✅ Camera and renderer configured");
        };

        const startAnimationLoop = () => {
            setLoadingMessage("");
            console.log("🎬 Bắt đầu animation loop");
            const animate = (currentTime) => {
                if (isCancelled || !isInitializedRef.current) return;
                animationFrameIdRef.current = requestAnimationFrame(animate);
                if (currentTime - lastFrameTimeRef.current < FRAME_INTERVAL) return;
                lastFrameTimeRef.current = currentTime;

                if (videoRef.current?.readyState >= 4) {
                    processFrame();
                }
            };
            animationFrameIdRef.current = requestAnimationFrame(animate);
        };



        // --- THAY THẾ TOÀN BỘ HÀM processFrame CŨ BẰNG HÀM NÀY ---

        const processFrame = () => {
            if (!handLandmarkerRef.current || !threeState.renderer || !threeState.camera) {
                return;
            }
            try {
                const { camera, scene, renderer } = threeState;

                const results = handLandmarkerRef.current.detectForVideo(
                    videoRef.current,
                    performance.now()
                );

                const debugCtx = debugCanvasRef.current.getContext('2d');
                debugCtx.clearRect(0, 0, debugCanvasRef.current.width, debugCanvasRef.current.height);

                const isHandVisible = results.landmarks?.length > 0;

                // Cập nhật trạng thái hiển thị của các vật thể
                if (threeState.fingerOccluder) threeState.fingerOccluder.visible = isHandVisible;
                if (threeState.ringModel) threeState.ringModel.visible = isHandVisible;

                if (isHandVisible) {
                    const landmarks = results.landmarks[0];
                    const handedness = results.handedness[0][0].categoryName;
                    const canvas = debugCanvasRef.current;

                    // --- TÍNH TOÁN CHUNG ---
                    const REFERENCE_HAND_WIDTH_PX = 300;
                    const REFERENCE_Z_DEPTH = 50;

                    const wristPx = { x: landmarks[0].x * canvas.width, y: landmarks[0].y * canvas.height };
                    const mcpPx = { x: landmarks[9].x * canvas.width, y: landmarks[9].y * canvas.height };
                    const handSizePx = Math.sqrt(Math.pow(wristPx.x - mcpPx.x, 2) + Math.pow(wristPx.y - mcpPx.y, 2));
                    const safeHandSizePx = handSizePx > 0 ? handSizePx : 1;
                    const estimatedZ = (REFERENCE_HAND_WIDTH_PX / safeHandSizePx) * REFERENCE_Z_DEPTH;

                    const vFov = camera.fov * Math.PI / 180;
                    const viewHeightAtZ = 2 * Math.tan(vFov / 2) * estimatedZ;
                    const viewWidthAtZ = viewHeightAtZ * camera.aspect;

                    // --- TÍNH TOÁN RIÊNG CHO NGÓN TAY ĐƯỢC CHỌN ---
                    const fingerName = selectedFingerRef.current;
                    const fingerData = FINGER_GEOMETRY_DATA[fingerName];
                    if (!fingerData) return;

                    const posLm1 = landmarks[fingerData.positionLandmarks[0]];
                    const posLm2 = landmarks[fingerData.positionLandmarks[1]];
                    const widthLm1 = landmarks[fingerData.widthLandmarks[0]];
                    const widthLm2 = landmarks[fingerData.widthLandmarks[1]];

                    // --- VỊ TRÍ ---
                    const midpointX = (posLm1.x + posLm2.x) / 2;
                    const midpointY = (posLm1.y + posLm2.y) / 2;
                    const targetPosition = new THREE.Vector3(
                        (midpointX - 0.5) * viewWidthAtZ,
                        -(midpointY - 0.5) * viewHeightAtZ,
                        -estimatedZ
                    );

                    // --- KÍCH THƯỚC (CHO CẢ NHẪN VÀ OCCLUDER) ---
                    const p_pos1 = new THREE.Vector2(posLm1.x * canvas.width, posLm1.y * canvas.height);
                    const p_pos2 = new THREE.Vector2(posLm2.x * canvas.width, posLm2.y * canvas.height);
                    const p_width1 = new THREE.Vector2(widthLm1.x * canvas.width, widthLm1.y * canvas.height);
                    const p_width2 = new THREE.Vector2(widthLm2.x * canvas.width, widthLm2.y * canvas.height);

                    const fingerWidthPx = p_width1.distanceTo(p_width2);
                    const fingerLengthPx = p_pos1.distanceTo(p_pos2);

                    const fingerWidthWorld = (fingerWidthPx / canvas.width) * viewWidthAtZ;
                    const fingerLengthWorld = (fingerLengthPx / canvas.height) * viewHeightAtZ;

                    // --- XOAY 3D HOÀN CHỈNH ---
                    const vec_pos1 = new THREE.Vector3(posLm1.x, posLm1.y, posLm1.z);
                    const vec_pos2 = new THREE.Vector3(posLm2.x, posLm2.y, posLm2.z);
                    const fingerDirection = new THREE.Vector3().subVectors(vec_pos2, vec_pos1).normalize();

                    const vec_width1 = new THREE.Vector3(widthLm1.x, widthLm1.y, widthLm1.z);
                    const vec_width2 = new THREE.Vector3(widthLm2.x, widthLm2.y, widthLm2.z);
                    const sideDirection = new THREE.Vector3().subVectors(vec_width1, vec_width2).normalize();

                    const handUp = handedness === "Left"
                        ? new THREE.Vector3().crossVectors(fingerDirection, sideDirection).normalize()
                        : new THREE.Vector3().crossVectors(sideDirection, fingerDirection).normalize();

                    const three_fY = new THREE.Vector3(fingerDirection.x, -fingerDirection.y, fingerDirection.z);
                    const three_handUp = new THREE.Vector3(handUp.x, -handUp.y, handUp.z);

                    const rotationMatrix = new THREE.Matrix4().lookAt(new THREE.Vector3(), three_fY, three_handUp);

                    // --- ÁP DỤNG CHO FINGER OCCLUDER ---
                    if (threeState.fingerOccluder) {
                        const occluderRadius = fingerWidthWorld / 2 * 1.2; // Làm to hơn 1 chút để che hết
                        const occluderLength = fingerLengthWorld * 1.5; // Làm dài hơn 1 chút

                        // Vị trí và Xoay của Occluder giống hệt vị trí và hướng của ngón tay
                        threeState.fingerOccluder.position.copy(targetPosition);
                        // Occluder không cần xoay 90 độ, nó nằm dọc theo ngón tay
                        threeState.fingerOccluder.quaternion.slerp(new THREE.Quaternion().setFromRotationMatrix(rotationMatrix), SMOOTHING_FACTOR);
                        // Scale cho hình trụ (radius, height, radius)
                        threeState.fingerOccluder.scale.lerp(new THREE.Vector3(occluderRadius, occluderLength, occluderRadius), SMOOTHING_FACTOR);
                    }

                    // --- ÁP DỤNG CHO NHẪN ---
                    if (threeState.ringModel) {
                        const RING_SCALE_ADJUSTMENT = 1.0;
                        const targetScaleValue = fingerWidthWorld * RING_SCALE_ADJUSTMENT;
                        const targetScale = new THREE.Vector3(targetScaleValue, targetScaleValue, targetScaleValue);

                        const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(rotationMatrix);
                        const correctionQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
                        targetQuaternion.multiply(correctionQuaternion);

                        threeState.ringModel.position.lerp(targetPosition, SMOOTHING_FACTOR);
                        threeState.ringModel.scale.lerp(targetScale, SMOOTHING_FACTOR);
                        threeState.ringModel.quaternion.slerp(targetQuaternion, SMOOTHING_FACTOR);
                    }

                    draw2DFeatures(debugCtx, landmarks, handedness);
                }

                renderer.render(scene, camera);

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

    const capturePhoto = useCallback(() => {
        try {
            const video = videoRef.current;
            const threeCanvas = threeCanvasRef.current;
            const debugCanvas = debugCanvasRef.current;

            if (!video || !threeCanvas || !debugCanvas) {
                console.error("Một trong các element chưa sẵn sàng.");
                setError("Không thể chụp ảnh. Vui lòng thử lại.");
                return;
            }

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = video.videoWidth;
            tempCanvas.height = video.videoHeight;
            const ctx = tempCanvas.getContext('2d');

            ctx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
            ctx.drawImage(threeCanvas, 0, 0, tempCanvas.width, tempCanvas.height);
            ctx.drawImage(debugCanvas, 0, 0, tempCanvas.width, tempCanvas.height);

            setCapturedImage(tempCanvas.toDataURL('image/jpeg', 0.9));
            console.log("📸 Photo captured with all layers");

        } catch (error) {
            console.error("❌ Capture photo error:", error);
            setError("Không thể chụp ảnh. Có lỗi xảy ra.");
        }
    }, []);

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

export default CameraScene2;