// Thư viện ngoài
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import * as THREE from 'three';


// Thư viện của mình
import { modelLoader4 } from '../../../utils/modelLoader4.js';
import { SimpleRingEnhancer4 } from '../../../utils/SimpleRingEnhancer4.js';

// css
import './TryOnRing.css';

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
const TryOnRing = () => {
    // const { ringId } = useParams(); // THAY ĐỔI 3: Không cần lấy ringId từ URL

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

    // THAY ĐỔI 4: Loại bỏ logic lấy ringConfig từ URL
    // const selectedRingId = ringId || DEFAULT_RING_ID;
    // const ringConfig = getRingById(selectedRingId);

    const threeState = useRef({
        renderer: null,
        scene: null,
        camera: null,
        ringModel: null,
        fingerOccluder: null,
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

        // THAY ĐỔI 5: Loại bỏ khối kiểm tra ringConfig
        // if (!ringConfig) {
        //     setError(`Không tìm thấy sản phẩm với ID: "${selectedRingId}"`);
        //     setLoadingMessage('');
        //     return;
        // }

        const initialize = async () => {
            if (isInitializedRef.current || isProcessing) return;
            setIsProcessing(true);
            setError(null);
            try {
                console.log("🚀 Bắt đầu khởi tạo");
                await setupMediaPipe();
                if (isCancelled) return;
                // THAY ĐỔI 6: Gọi setupThreeScene mà không cần tham số
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

        // THAY ĐỔI 7: Sửa hàm setupThreeScene để không phụ thuộc vào `currentRingConfig`
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

                threeState.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000);
                threeState.camera.position.set(0, 0, 5);
                threeState.camera.lookAt(0, 0, 0);

                threeState.scene.add(new THREE.AmbientLight(0xffffff, 1.5));
                const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
                dirLight.position.set(3, 10, 7);
                threeState.scene.add(dirLight);

                // THAY ĐỔI 8: Tải trực tiếp mô hình 'nhanDario.glb'
                setLoadingMessage("Đang tải mô hình nhẫn...");
                const ringContainer = await modelLoader4('/models/nhanDario.glb');

                if (typeof SimpleRingEnhancer4 !== 'undefined') {
                    try {
                        setLoadingMessage("Làm đẹp mô hình...");
                        const enhancer = new SimpleRingEnhancer4(threeState.renderer);
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

                threeState.ringModel.visible = false;
                threeState.scene.add(threeState.ringModel);

                console.log("✅ Three.js setup complete");
                console.log("📊 Ring position:", threeState.ringModel.position);
                console.log("📊 Ring scale:", threeState.ringModel.scale);
            } catch (error) {
                console.error("❌ Three.js setup failed:", error);
                throw new Error("Không thể tải mô hình 3D.");
            }

            console.log("🛠️ Tạo Finger Occluder...");
            const occluderGeometry = new THREE.CylinderGeometry(1, 1, 1, 16);
            occluderGeometry.rotateX(Math.PI / 2);

            const occluderMaterial = new THREE.MeshBasicMaterial({
                colorWrite: false,
                depthWrite: true,
            });
            threeState.fingerOccluder = new THREE.Mesh(occluderGeometry, occluderMaterial);
            threeState.fingerOccluder.renderOrder = 0;
            if (threeState.ringModel) {
                threeState.ringModel.renderOrder = 1;
            }
            threeState.fingerOccluder.visible = false;
            threeState.scene.add(threeState.fingerOccluder);
            console.log("✅ Finger Occluder đã sẵn sàng.");

            console.log("✅ Three.js setup complete");
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
                        resizeMode: 'crop-and-scale'
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

        const setupCameraAndRenderer = () => {
            const { videoWidth: vW, videoHeight: vH } = videoRef.current;
            console.log(`📐 Video size: ${vW}x${vH}`);
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
                if (isHandVisible && threeState.ringModel && threeState.fingerOccluder) {
                    threeState.ringModel.visible = true;
                    threeState.fingerOccluder.visible = true;
                    const landmarks = results.landmarks[0];
                    const handedness = results.handedness[0][0].categoryName;
                    const camera = threeState.camera;
                    const RING_PLANE_Z = 0;
                    const distance = camera.position.z - RING_PLANE_Z;
                    const fovInRadians = (camera.fov * Math.PI) / 180;
                    const viewHeight = 2 * Math.tan(fovInRadians / 2) * distance;
                    const viewWidth = viewHeight * camera.aspect;
                    const landmarkToWorld = (lm) => {
                        const worldX = (lm.x - 0.5) * viewWidth;
                        const worldY = -(lm.y - 0.5) * viewHeight + 0.1;
                        const worldZ = lm.z * viewWidth * -1.3;
                        return new THREE.Vector3(worldX, worldY, worldZ);
                    };
                    const fingerName = selectedFingerRef.current;
                    const fingerData = FINGER_GEOMETRY_DATA[fingerName];
                    if (!fingerData) return;
                    const posLm1 = landmarks[fingerData.positionLandmarks[0]];
                    const posLm2 = landmarks[fingerData.positionLandmarks[1]];
                    const widthLm1 = landmarks[fingerData.widthLandmarks[0]];
                    const widthLm2 = landmarks[fingerData.widthLandmarks[1]];
                    if (!posLm1 || !posLm2 || !widthLm1 || !widthLm2) {
                        threeState.ringModel.visible = false;
                        threeState.fingerOccluder.visible = false;
                        return;
                    }
                    const worldPos1 = landmarkToWorld(posLm1);
                    const worldPos2 = landmarkToWorld(posLm2);
                    const targetPosition = new THREE.Vector3().addVectors(worldPos1, worldPos2).multiplyScalar(0.5);
                    const fingerWidthInWorld = landmarkToWorld(widthLm1).distanceTo(landmarkToWorld(widthLm2));
                    const SCALE_ADJUSTMENT_FACTOR = 0.5;
                    const targetScaleValue = fingerWidthInWorld * SCALE_ADJUSTMENT_FACTOR;
                    const targetScale = new THREE.Vector3(targetScaleValue, targetScaleValue, targetScaleValue);
                    const fingerDirection = new THREE.Vector3().subVectors(worldPos2, worldPos1).normalize();
                    const sideDirection = new THREE.Vector3().subVectors(landmarkToWorld(widthLm1), landmarkToWorld(widthLm2)).normalize();
                    const handUp = handedness === "Left"
                        ? new THREE.Vector3().crossVectors(fingerDirection, sideDirection).normalize()
                        : new THREE.Vector3().crossVectors(sideDirection, fingerDirection).normalize();
                    const rotationMatrix = new THREE.Matrix4();
                    rotationMatrix.lookAt(new THREE.Vector3(), fingerDirection, handUp);
                    const baseTargetQuaternion = new THREE.Quaternion().setFromRotationMatrix(rotationMatrix);
                    const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(rotationMatrix);
                    const correctionQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -(Math.PI / 2));
                    targetQuaternion.multiply(correctionQuaternion);
                    threeState.ringModel.position.lerp(targetPosition, SMOOTHING_FACTOR);
                    threeState.fingerOccluder.position.lerp(targetPosition, SMOOTHING_FACTOR);
                    threeState.ringModel.scale.lerp(targetScale, SMOOTHING_FACTOR);
                    const occluderRadius = fingerWidthInWorld / 2.1;
                    const occluderLength = fingerWidthInWorld * 2;
                    threeState.fingerOccluder.scale.set(occluderRadius, occluderRadius, occluderLength);
                    threeState.ringModel.quaternion.slerp(targetQuaternion, SMOOTHING_FACTOR);
                    threeState.fingerOccluder.quaternion.slerp(baseTargetQuaternion, SMOOTHING_FACTOR);
                } else {
                    if (threeState.ringModel) {
                        threeState.ringModel.visible = false;
                    }
                    if (threeState.fingerOccluder) {
                        threeState.fingerOccluder.visible = false;
                    }
                }
                threeState.renderer.render(threeState.scene, threeState.camera);
            } catch (error) {
                console.error("❌ Process frame error:", error);
            }
        };

        // Hàm draw2DFeatures không thay đổi

        if (!capturedImage && !isInitializedRef.current) {
            initialize();
        }

        return () => {
            isCancelled = true;
            cleanup();
        };
        // THAY ĐỔI 9: Xóa các dependency không còn sử dụng
    }, [capturedImage, cleanup]);


    // Các hàm capturePhoto, retakePhoto, downloadPhoto, handleRetry, handleClose không thay đổi
    // ... (Giữ nguyên phần còn lại của component)
    const capturePhoto = useCallback(() => {
        try {
            const video = videoRef.current;
            const threeCanvas = threeCanvasRef.current;
            const debugCanvas = debugCanvasRef.current;
            if (!video || !threeCanvas || !debugCanvas) {
                console.error("Một trong các element (video, threeCanvas, debugCanvas) chưa sẵn sàng.");
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
            link.download = `thankyourbelovedcustomer-${Date.now()}.png`;
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
        window.history.back();
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
                    {/* <img src={MirrorLogo} alt="Mirror Logo" className="mirror-logo" /> */}
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

export default TryOnRing;