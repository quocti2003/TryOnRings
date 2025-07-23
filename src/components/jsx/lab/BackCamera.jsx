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
import { modelLoader2 } from '../../../utils/modelLoader2.js';

// --- PHẦN 2: HÀM HỖ TRỢ VÀ HẰNG SỐ ---
// (Phần này đã được xóa, không còn hàm hỗ trợ nào ở đây)

// --- PHẦN 3: ĐỊNH NGHĨA COMPONENT ---
// Định nghĩa một React functional component tên là BackCamera.
const BackCamera = () => {
    // --- 3.1: KHỞI TẠO REF VÀ STATE ---
    // useRef được dùng để tham chiếu trực tiếp đến các phần tử DOM (video, canvas) mà không cần render lại component.
    const videoRef = useRef(null);       // Ref cho thẻ <video> hiển thị luồng camera.
    const threeCanvasRef = useRef(null);   // Ref cho canvas vẽ cảnh 3D của Three.js (chiếc nhẫn).
    const debugCanvasRef = useRef(null);   // Ref cho canvas vẽ các thông tin gỡ lỗi (trục tọa độ).

    // useState được dùng để quản lý các trạng thái của component. Khi state thay đổi, component sẽ render lại.
    const [loadingMessage, setLoadingMessage] = useState("Initializing..."); // Lưu và hiển thị thông báo tải.
    const [handDetected, setHandDetected] = useState(false);                 // Trạng thái cho biết có phát hiện tay hay không.
    const [capturedImage, setCapturedImage] = useState(null);                // Lưu trữ ảnh đã chụp dưới dạng base64.
    const [error, setError] = useState(null);                                // Lưu trữ thông báo lỗi nếu có.

    // --- 3.2: CÁC HẰNG SỐ ĐIỀU CHỈNH ---
    // Các hằng số để tùy chỉnh giao diện của các trục tọa độ gỡ lỗi.
    const AXIS_THICKNESS = 4;        // Độ dày của đường kẻ trục.
    const AXIS_LENGTH = 50;          // Chiều dài của đường kẻ trục (tính bằng pixel).
    const ARROW_LENGTH = 10;         // Chiều dài của mũi tên ở cuối mỗi trục.
    const ARROW_ANGLE = Math.PI / 7; // Góc của mũi tên.
    const ORIGIN_POINT_SIZE = 6;     // Kích thước của điểm gốc tọa độ.
    const SMOOTHING_FACTOR = 0.15;
    const BASE_RING_SCALE = 0.003;
    // --- 3.3: APP STATE ---
    // Sử dụng useRef để lưu trữ các đối tượng và trạng thái không cần kích hoạt re-render.
    // Đây là cách tối ưu hiệu năng vì các giá trị này thay đổi liên tục mỗi frame.
    const appState = useRef({
        handLandmarker: null,        // Đối tượng HandLandmarker của MediaPipe sau khi được khởi tạo.
        animationFrameId: null,      // ID của requestAnimationFrame, dùng để hủy vòng lặp animation.
        videoStream: null,           // Luồng video từ webcam.
        scene: new THREE.Scene(),    // Cảnh (scene) 3D của Three.js, chứa tất cả các đối tượng 3D.
        camera: new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000), // Camera 3D để nhìn vào scene.
        renderer: null,              // Trình kết xuất (renderer) của Three.js để vẽ scene lên canvas.
        ringModel: null,             // Đối tượng mô hình 3D của chiếc nhẫn sau khi được tải.
        // Các vector 3D được tái sử dụng để tính toán, tránh việc tạo mới mỗi frame.
        math: {
            // vector trong khong gian 3 chieu, co huong, co do dai
            p0: new THREE.Vector3(), // landmark 0 --> diem goc de xac dinh mat phang long ban tay --> wrist
            p5: new THREE.Vector3(), // landmark 5 --> index finger mcp --> goc ngon tro
            p9: new THREE.Vector3(), // landmark 9 --> middle finger mcp --> goc ngon giua
            p13: new THREE.Vector3(), // landmark 13 --> ring finger mcp --> goc ngon deo nhan
            p14: new THREE.Vector3(), // landmark 14 --> ring finger pip --> tren goc ngon deo nhan 1 dot
            p17: new THREE.Vector3(), // landmark 17 --> pinky mcp --> goc ngon ut

            fingerDir: new THREE.Vector3(),
            palmDirX: new THREE.Vector3(),
            palmDirY: new THREE.Vector3(),
            palmNormal: new THREE.Vector3(), // vector phap tuyen cua long ban tay, chi thang ra tu long ban tay


            fingerX: new THREE.Vector3(), // Vector này chỉ ngang qua chiều rộng của ngón tay
            fingerY: new THREE.Vector3(), // fingerY = p14 - p13 vector chi huong cua ngon tay --> doc thieu chieu cua ngon tay 
            fingerZ: new THREE.Vector3(), // vector nay chi thang ra tu mat tren cua ngon tay (cho co mong tay)

            midPoint: new THREE.Vector3(),
            targetScale: new THREE.Vector3(),

            // Cho logic xoay
            targetMatrix: new THREE.Matrix4(),
            targetQuaternion: new THREE.Quaternion(),
            autoRotationQuaternion: new THREE.Quaternion(),
            finalRingQuaternion: new THREE.Quaternion(),
            rotationAngle: 0,
            standardXAxis: new THREE.Vector3(1, 0, 0),
            standardYAxis: new THREE.Vector3(0, 1, 0),
            standardZAxis: new THREE.Vector3(0, 0, 1),

        }
    }).current; // .current để truy cập trực tiếp vào giá trị của ref.

    // --- PHẦN 4: useEffect ---
    // useEffect được dùng để xử lý các "side effect" như gọi API, tương tác DOM, khởi tạo thư viện.
    // Hook này sẽ chạy sau khi component được render lần đầu.
    // Dependency array [capturedImage] có nghĩa là hook sẽ chạy lại khi giá trị `capturedImage` thay đổi.
    useEffect(() => {
        // Biến cờ để kiểm tra xem component có còn được mount hay không.
        // Giúp ngăn ngừa lỗi khi cập nhật state trên một component đã bị unmount.
        let isCancelled = false;

        // Hàm chính để khởi tạo toàn bộ ứng dụng.
        const initialize = async () => {
            setError(null); // Xóa lỗi cũ trước khi bắt đầu.
            try {
                if (isCancelled) return; // Nếu component đã unmount, không làm gì cả.
                await setupMediaPipe();  // Khởi tạo mô hình nhận diện tay của MediaPipe.
                if (isCancelled) return;
                await setupThreeScene(); // Chuẩn bị cảnh 3D với Three.js.
                if (isCancelled) return;
                await startWebcam();     // Mở và cấu hình camera.
                startAnimationLoop();    // Bắt đầu vòng lặp xử lý và vẽ mỗi frame.
            } catch (err) {
                if (isCancelled) return;
                console.error("Initialization failed:", err);
                // Hiển thị lỗi cho người dùng.
                setError(err.message || "Không thể khởi tạo. Vui lòng kiểm tra quyền camera và thử lại.");
                setLoadingMessage(""); // Ẩn thông báo loading.
            }
        };

        // Hàm thiết lập MediaPipe HandLandmarker.
        const setupMediaPipe = async () => {
            setLoadingMessage("Tải mô hình nhận diện...");
            // Tải các file cần thiết cho MediaPipe Vision.
            const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm");
            // Tạo một đối tượng HandLandmarker với các tùy chọn.
            appState.handLandmarker = await HandLandmarker.createFromOptions(vision, {
                baseOptions: {
                    // Đường dẫn đến file mô hình đã được huấn luyện.
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                    // Sử dụng GPU để tăng tốc xử lý nếu có thể.
                    delegate: "GPU",
                },
                runningMode: "VIDEO", // Chế độ xử lý cho luồng video liên tục.
                numHands: 1,          // Chỉ nhận diện tối đa 1 bàn tay.
            });
        };

        // Hàm thiết lập cảnh 3D của Three.js.
        const setupThreeScene = async () => {
            setLoadingMessage("Chuẩn bị không gian 3D...");
            appState.camera.position.z = 5; // Đặt camera ở một khoảng cách để nhìn thấy scene.
            // Thêm ánh sáng môi trường để tất cả các đối tượng đều được chiếu sáng.
            appState.scene.add(new THREE.AmbientLight(0xffffff, 1.5));
            // Thêm ánh sáng có hướng để tạo bóng và chiều sâu.
            const dirLight = new THREE.DirectionalLight(0xffffff, 2);
            dirLight.position.set(5, 5, 5);
            appState.scene.add(dirLight);

            // Tải mô hình 3D của chiếc nhẫn.
            try {
                setLoadingMessage("Đang tải mô hình nhẫn...");
                // Gọi hàm modelLoader đã import
                const ringContainer = await modelLoader('/models/demo-ring.glb');

                // Lưu toàn bộ container (gồm nhẫn và các trục) vào appState
                appState.ringModel = ringContainer;

                // Mặc định ẩn container đi
                appState.ringModel.visible = false;

                // Thêm container vào cảnh 3D
                appState.scene.add(appState.ringModel);
            } catch (error) {
                console.error("Không thể tải mô hình nhẫn:", error);
                // Có thể ném lỗi ra ngoài để hàm initialize bắt được
                throw new Error("Không thể tải mô hình nhẫn. Vui lòng kiểm tra đường dẫn và file.");
            }
        };

        // Hàm khởi động webcam.
        const startWebcam = async () => {
            setLoadingMessage("Mở camera...");
            if (!navigator.mediaDevices?.getUserMedia) throw new Error("Trình duyệt không hỗ trợ camera.");

            // Yêu cầu quyền truy cập camera từ người dùng.
            const stream = await navigator.mediaDevices.getUserMedia({
                // Ưu tiên camera sau ('environment'), độ phân giải cao.
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            appState.videoStream = stream; // Lưu luồng video lại.
            videoRef.current.srcObject = stream; // Gán luồng video cho thẻ <video>.

            // Trả về một Promise, sẽ resolve khi video đã sẵn sàng để phát.
            return new Promise((resolve) => {
                videoRef.current.onloadedmetadata = () => {
                    videoRef.current.play(); // Phát video.
                    // Lấy kích thước thực tế của video.
                    const { videoWidth: vW, videoHeight: vH } = videoRef.current;
                    // Cài đặt kích thước cho các canvas để khớp với video.
                    threeCanvasRef.current.width = vW;
                    threeCanvasRef.current.height = vH;
                    debugCanvasRef.current.width = vW;
                    debugCanvasRef.current.height = vH;
                    // Cập nhật tỷ lệ khung hình cho camera 3D.
                    appState.camera.aspect = vW / vH;
                    appState.camera.updateProjectionMatrix();
                    // Khởi tạo renderer của Three.js.
                    appState.renderer = new THREE.WebGLRenderer({ canvas: threeCanvasRef.current, antialias: true, alpha: true });
                    appState.renderer.setSize(vW, vH); // Đặt kích thước renderer.
                    appState.renderer.setPixelRatio(window.devicePixelRatio); // Tối ưu cho màn hình có mật độ điểm ảnh cao.
                    resolve(); // Báo hiệu đã xong.
                };
            });
        };

        // Hàm bắt đầu vòng lặp animation.
        const startAnimationLoop = () => {
            setLoadingMessage(""); // Xóa thông báo loading.
            const animate = () => {
                if (isCancelled) return; // Dừng lại nếu component đã unmount.
                // Yêu cầu trình duyệt gọi lại hàm animate ở frame tiếp theo.
                appState.animationFrameId = requestAnimationFrame(animate);
                // Chỉ xử lý khi video đã tải xong và sẵn sàng.
                if (videoRef.current?.readyState >= 4) {
                    // Chạy nhận diện tay trên frame video hiện tại.
                    const results = appState.handLandmarker.detectForVideo(videoRef.current, performance.now());
                    // Gửi kết quả đến hàm xử lý.
                    processFrame(results);
                }
            };
            animate(); // Bắt đầu vòng lặp.
        };

        const getWorldVector = (landmark, distance, targetVector) => {
            // 1. Lấy FOV (Field of View - Góc nhìn) của camera và đổi sang radians
            const fovInRadians = (appState.camera.fov * Math.PI) / 180;

            // 2. Tính chiều cao của khung nhìn camera ở một khoảng cách 'distance' nhất định
            const height = 2 * Math.tan(fovInRadians / 2) * distance;

            // 3. Tính chiều rộng của khung nhìn dựa trên chiều cao và tỉ lệ khung hình (aspect ratio)
            const width = height * appState.camera.aspect;

            // 4. Đặt vị trí cuối cùng
            targetVector.set(
                (landmark.x - 0.5) * width,
                -(landmark.y - 0.5) * height,
                -distance
            );
        };

        const processFrame = (results) => {
            // Lấy các đối tượng cần thiết từ appState và refs.
            const { ringModel, camera, renderer, scene } = appState;
            const debugCtx = debugCanvasRef.current.getContext('2d');

            // Bước 1: Dọn dẹp canvas cho frame mới.
            renderer.clear();
            debugCtx.clearRect(0, 0, debugCanvasRef.current.width, debugCanvasRef.current.height);

            // Bước 2: Kiểm tra xem có tay trong kết quả không.
            const isHandVisible = results.landmarks?.length > 0 && results.handedness?.length > 0;
            setHandDetected(isHandVisible);

            // BƯỚC 3: LOGIC HIỂN THỊ NHẪN
            if (ringModel) {
                // SỬA LỖI: Hiển thị nhẫn khi có tay, ẩn khi không có tay
                ringModel.visible = isHandVisible;
            }

            // Bước 4: Xử lý chính nếu phát hiện có tay.
            if (isHandVisible) {
                // --- Lấy dữ liệu ---
                const landmarks = results.landmarks[0];
                const hand = results.handedness[0][0].categoryName;
                const canvasWidth = debugCanvasRef.current.width;
                const canvasHeight = debugCanvasRef.current.height;

                // --- TÍNH TOÁN HỆ TRỤC TỌA ĐỘ ---
                const p0 = new THREE.Vector3(landmarks[0].x, landmarks[0].y, landmarks[0].z);
                const p5 = new THREE.Vector3(landmarks[5].x, landmarks[5].y, landmarks[5].z);
                const p12 = new THREE.Vector3(landmarks[12].x, landmarks[12].y, landmarks[12].z);
                const p13 = new THREE.Vector3(landmarks[13].x, landmarks[13].y, landmarks[13].z);
                const p14 = new THREE.Vector3(landmarks[14].x, landmarks[14].y, landmarks[14].z);
                const p16 = new THREE.Vector3(landmarks[16].x, landmarks[16].y, landmarks[16].z);
                const p17 = new THREE.Vector3(landmarks[17].x, landmarks[17].y, landmarks[17].z);

                const yVec = new THREE.Vector3().subVectors(p14, p13).normalize();
                const vec5_0 = new THREE.Vector3().subVectors(p5, p0);
                const vec17_0 = new THREE.Vector3().subVectors(p17, p0);

                let zVecPalm = new THREE.Vector3().crossVectors(vec5_0, vec17_0);
                if (hand === 'Left') {
                    zVecPalm.negate();
                }
                zVecPalm.normalize(); // zVecPalm hiện đang chỉ vào lòng bàn tay

                let xVec = new THREE.Vector3().crossVectors(yVec, zVecPalm).normalize(); // xVec hiện đang chỉ sang trái

                // SỬA LỖI & TINH CHỈNH TRỤC TỌA ĐỘ THEO YÊU CẦU
                const fX = xVec.negate(); // Trục X chỉ về bên PHẢI (đúng yêu cầu)
                const fY = yVec; // Trục Y dọc theo ngón tay
                const fZ = zVecPalm.clone().negate(); // Trục Z hướng ra khỏi mu bàn tay (đúng yêu cầu)

                // Lấy trung điểm gốc
                const midpoint = {
                    x: (landmarks[13].x + landmarks[14].x) / 2,
                    y: (landmarks[13].y + landmarks[14].y) / 2,
                    z: (landmarks[13].z + landmarks[14].z) / 2
                };



                // --- ÁP DỤNG VÀO MÔ HÌNH 3D (Bản hoàn chỉnh có smoothing) ---
                // if (ringModel) {
                //     // =========================================================================
                //     // GIẢI PHÁP TỐI ƯU: TÍNH TOÁN TRONG KHÔNG GIAN MÀN HÌNH (SCREEN SPACE)
                //     // =========================================================================

                //     const canvas = threeCanvasRef.current;

                //     // --- Bước 1: Tính toán Vị trí (X, Y) trên màn hình ---
                //     // Đây là tọa độ pixel chính xác của điểm giữa trên màn hình.
                //     const targetX = midpoint.x * canvas.width;
                //     const targetY = midpoint.y * canvas.height;

                //     // --- Bước 2: Tính toán Kích thước (Scale) trên màn hình ---
                //     // Đo khoảng cách pixel giữa khớp ngón áp út (13) và ngón giữa (9).
                //     const p13_px = new THREE.Vector2(landmarks[13].x * canvas.width, landmarks[13].y * canvas.height);
                //     const p9_px = new THREE.Vector2(landmarks[9].x * canvas.width, landmarks[9].y * canvas.height);
                //     const fingerWidthInPixels = p13_px.distanceTo(p9_px);

                //     // --- Bước 3: Đặt Vị trí và Kích thước cho Nhẫn trong không gian 3D ---
                //     // Để làm điều này, chúng ta cần biết khoảng cách từ camera đến vật thể. 
                //     // Chúng ta sẽ giữ một khoảng cách Z cố định.
                //     const DISTANCE_FROM_CAMERA = 5; // Bạn có thể tinh chỉnh số này

                //     // Tính chiều cao của khung nhìn tại khoảng cách đó.
                //     const fovInRadians = (camera.fov * Math.PI) / 180;
                //     const viewHeight = 2 * Math.tan(fovInRadians / 2) * DISTANCE_FROM_CAMERA;

                //     // Tính scale cần thiết để model có kích thước bằng fingerWidthInPixels.
                //     // (Giả sử model gốc có chiều cao là 1 đơn vị)
                //     const targetScaleValue = (fingerWidthInPixels / canvas.height) * viewHeight * 0.5;
                //     const targetScale = new THREE.Vector3(targetScaleValue, targetScaleValue, targetScaleValue);

                //     // Chuyển đổi tọa độ pixel (targetX, targetY) thành tọa độ thế giới 3D.
                //     const targetPosition = new THREE.Vector3(
                //         (targetX / canvas.width - 0.5) * viewHeight * camera.aspect,
                //         -(targetY / canvas.height - 0.5) * viewHeight,
                //         -DISTANCE_FROM_CAMERA
                //     );
                //     // PHẦN 2: TÍNH HỆ TRỤC TỌA ĐỘ (ROTATION) - ĐÂY LÀ PHẦN BỊ THIẾU
                //     // Tạo ma trận xoay từ các vector cơ sở fX, fY, fZ
                //     const rotationMatrix = new THREE.Matrix4().makeBasis(fX, fY, fZ);

                //     // Chuyển ma trận xoay thành quaternion
                //     // const handOrientation = new THREE.Quaternion().setFromRotationMatrix(rotationMatrix);

                //     // Áp dụng phép xoay điều chỉnh 180 độ quanh trục X (nếu cần)
                //     // const correctionAxis = new THREE.Vector3(1, 0, 0);
                //     // const correctionAngle = Math.PI;
                //     // const correctionQuaternion = new THREE.Quaternion().setFromAxisAngle(correctionAxis, correctionAngle);

                //     // Kết hợp hai phép xoay
                //     // const targetQuaternion = new THREE.Quaternion().multiplyQuaternions(handOrientation, correctionQuaternion);
                //     const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(rotationMatrix);


                //     // PHẦN 4: ÁP DỤNG VÀO MODEL (với smoothing)
                //     const SMOOTHING_FACTOR = 0.15;
                //     ringModel.position.lerp(targetPosition, SMOOTHING_FACTOR);
                //     ringModel.quaternion.slerp(targetQuaternion, SMOOTHING_FACTOR);
                //     ringModel.scale.lerp(targetScale, SMOOTHING_FACTOR);

                //     console.log("Ring positioned at midpoint 13-14 with proper orientation");
                // }


                if (ringModel) {
                    const canvas = threeCanvasRef.current;

                    // --- POSITION (giữ nguyên) ---
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

                    // --- ROTATION FIX: PROPER COORDINATE TRANSFORMATION ---

                    // Step 1: Convert hand vectors to 2D screen space for debugging
                    const fX_2D = new THREE.Vector2(fX.x, fX.y).normalize();
                    const fY_2D = new THREE.Vector2(fY.x, fY.y).normalize();
                    const fZ_2D = new THREE.Vector2(fZ.x, fZ.y).normalize();

                    // Step 2: Create proper Three.js coordinate system
                    // The key insight: We need to map hand coordinate to ring coordinate properly


                    // OPTION 3: Camera-relative coordinate (comment/uncomment to test)

                    const ringX = new THREE.Vector3(fX.x, -fX.y, fX.z); // Flip X
                    const ringY = new THREE.Vector3(fY.x, fY.y, fY.z);  // Flip Y  
                    const ringZ = new THREE.Vector3(fZ.x, fZ.y, -fZ.z);  // Flip Z


                    // Create rotation matrix
                    const rotationMatrix = new THREE.Matrix4().makeBasis(ringX, ringY, ringZ);
                    const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(rotationMatrix);

                    // Apply with smoothing
                    const SMOOTHING_FACTOR = 0.15;
                    ringModel.position.lerp(targetPosition, SMOOTHING_FACTOR);
                    ringModel.quaternion.slerp(targetQuaternion, SMOOTHING_FACTOR);
                    ringModel.scale.lerp(targetScale, SMOOTHING_FACTOR);

                    // DEBUG: Log để theo dõi
                    console.log("Hand fX:", fX.toArray());
                    console.log("Hand fY:", fY.toArray());
                    console.log("Hand fZ:", fZ.toArray());
                    console.log("Ring rotation euler:", ringModel.rotation);
                }



                // --- VẼ DEBUG 2D ---
                const originPx = { x: midpoint.x * canvasWidth, y: midpoint.y * canvasHeight };
                // ... (phần code vẽ debug giữ nguyên) ...
                const AXIS_THICKNESS = 2, AXIS_LENGTH = 50, ARROW_LENGTH = 10, ARROW_ANGLE = Math.PI / 6, ORIGIN_POINT_SIZE = 5;
                debugCtx.lineWidth = AXIS_THICKNESS;
                debugCtx.lineCap = 'round';
                const drawAxisWithArrow = (vec, color, label) => {
                    const endPx = { x: originPx.x + vec.x * AXIS_LENGTH, y: originPx.y + vec.y * AXIS_LENGTH };
                    debugCtx.strokeStyle = color;
                    debugCtx.beginPath();
                    debugCtx.moveTo(originPx.x, originPx.y);
                    debugCtx.lineTo(endPx.x, endPx.y);
                    debugCtx.stroke();
                    const angle = Math.atan2(endPx.y - originPx.y, endPx.x - originPx.x);
                    debugCtx.beginPath();
                    debugCtx.moveTo(endPx.x, endPx.y);
                    debugCtx.lineTo(endPx.x - ARROW_LENGTH * Math.cos(angle - ARROW_ANGLE), endPx.y - ARROW_LENGTH * Math.sin(angle - ARROW_ANGLE));
                    debugCtx.stroke();
                    debugCtx.beginPath();
                    debugCtx.moveTo(endPx.x, endPx.y);
                    debugCtx.lineTo(endPx.x - ARROW_LENGTH * Math.cos(angle + ARROW_ANGLE), endPx.y - ARROW_LENGTH * Math.sin(angle + ARROW_ANGLE));
                    debugCtx.stroke();
                    debugCtx.fillStyle = color;
                    debugCtx.font = 'bold 16px Arial';
                    debugCtx.fillText(label, endPx.x + vec.x * 10, endPx.y + vec.y * 10);
                };
                // drawAxisWithArrow(fX, 'rgb(255, 0, 0)', 'fX');
                // drawAxisWithArrow(fY, 'rgb(0, 255, 0)', 'fY');
                // drawAxisWithArrow(fZ, 'rgb(0, 0, 255)', 'fZ');
                debugCtx.fillStyle = 'yellow';
                debugCtx.beginPath();
                debugCtx.arc(originPx.x, originPx.y, ORIGIN_POINT_SIZE, 0, 2 * Math.PI);
                debugCtx.fill();
            }

            // Cuối cùng, yêu cầu renderer vẽ scene đã được cập nhật lên canvas 3D.
            renderer.render(scene, camera);
        };

        // Chỉ chạy hàm khởi tạo nếu chưa có ảnh nào được chụp.
        if (!capturedImage) {
            initialize();
        }

        // Hàm dọn dẹp (cleanup function) của useEffect.
        // Sẽ được gọi khi component bị unmount hoặc trước khi effect chạy lại.
        return () => {
            isCancelled = true; // Đặt cờ để dừng các tiến trình bất đồng bộ.
            if (appState.animationFrameId) {
                // Hủy vòng lặp animation để tiết kiệm tài nguyên.
                cancelAnimationFrame(appState.animationFrameId);
                appState.animationFrameId = null;
            }
            if (appState.videoStream) {
                // Dừng luồng video và giải phóng camera.
                appState.videoStream.getTracks().forEach(track => track.stop());
                appState.videoStream = null;
            }
        };
    }, [capturedImage]); // Dependency array

    // --- PHẦN 5: CÁC HÀM XỬ LÝ SỰ KIỆN ---
    // Hàm chụp ảnh.
    const capturePhoto = () => {
        const video = videoRef.current;
        const threeCanvas = threeCanvasRef.current;
        const debugCanvas = debugCanvasRef.current;
        if (!video || !threeCanvas || !debugCanvas) return;

        // Tạo một canvas tạm thời để gộp các lớp ảnh lại với nhau.
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = video.videoWidth;
        tempCanvas.height = video.videoHeight;
        const ctx = tempCanvas.getContext('2d');
        // Vẽ lần lượt: video nền, lớp 3D (đang trống), và lớp debug.
        ctx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
        ctx.drawImage(threeCanvas, 0, 0, tempCanvas.width, tempCanvas.height);
        ctx.drawImage(debugCanvas, 0, 0, tempCanvas.width, tempCanvas.height);

        // Chuyển canvas thành ảnh dạng base64 và lưu vào state.
        setCapturedImage(tempCanvas.toDataURL('image/png'));
    };

    // Hàm chụp lại: reset state capturedImage về null để quay lại màn hình camera.
    const retakePhoto = () => setCapturedImage(null);
    // Hàm xử lý nút đóng (hiện chỉ log ra console).
    const handleClose = () => console.log("Close clicked");
    // Hàm thử lại khi có lỗi: reset state lỗi và ảnh chụp.
    const handleRetry = () => {
        setError(null);
        setCapturedImage(null);
    };
    // Hàm tải ảnh về máy.
    const downloadPhoto = () => {
        if (!capturedImage) return;
        const link = document.createElement('a');
        link.download = `ring-try-on-${Date.now()}.png`; // Tên file tải về.
        link.href = capturedImage; // Đường dẫn là dữ liệu base64 của ảnh.
        link.click(); // Giả lập một cú click để trình duyệt bắt đầu tải.
    };

    // --- PHẦN 6: RENDER GIAO DIỆN JSX ---
    return (
        <div className="mirror-container">
            {/* Vùng hiển thị camera hoặc ảnh đã chụp */}
            <div className="camera-feed">
                {/* Dựa vào state `capturedImage` để hiển thị video hoặc ảnh */}
                {!capturedImage ? (
                    <>
                        {/* Các phần tử hiển thị khi đang ở chế độ camera */}
                        <video ref={videoRef} className="camera-video" autoPlay playsInline muted />
                        <canvas ref={threeCanvasRef} className="detection-canvas" />
                        <canvas ref={debugCanvasRef} className="detection-canvas" style={{ pointerEvents: 'none' }} />
                    </>
                ) : (
                    // Hiển thị ảnh đã chụp
                    <img src={capturedImage} alt="Captured" className="captured-image" />
                )}
            </div>

            {/* Lớp giao diện người dùng (UI) nằm đè lên trên */}
            <div className="ui-overlay">
                <header className="mirror-header">
                    <button onClick={handleClose} className="close-button" aria-label="Close">×</button>
                    <h1 className="mirror-title">MIRROR</h1>
                </header>
                <main className="mirror-main">
                    {/* Hướng dẫn người dùng, sẽ ẩn đi khi có điều kiện khác xảy ra */}
                    <p className={`instruction-text ${handDetected || loadingMessage || capturedImage || error ? 'instruction-text--hidden' : ''}`}>
                        Position your hand to start
                    </p>
                </main>
                <footer className="mirror-footer">
                    {/* Hiển thị thông báo lỗi và nút thử lại */}
                    {error && !capturedImage && (
                        <div className="error-container">
                            <p className="error-text">{error}</p>
                            <button onClick={handleRetry} className="action-button">Try Again</button>
                        </div>
                    )}
                    {/* Hiển thị nút chụp ảnh */}
                    {!error && !capturedImage && (
                        <button onClick={capturePhoto} className="capture-button" aria-label="Capture photo" />
                    )}
                    {/* Hiển thị các nút sau khi đã chụp ảnh */}
                    {capturedImage && (
                        <div className="action-buttons-container">
                            <button onClick={retakePhoto} className="action-button">Retake</button>
                            <button onClick={downloadPhoto} className="action-button">Download</button>
                        </div>
                    )}
                </footer>
            </div>
            {/* Lớp phủ hiển thị thông báo loading */}
            {loadingMessage && (
                <div className="loading-overlay">
                    <p className="loading-text">{loadingMessage}</p>
                </div>
            )}
        </div>
    );
};

export default BackCamera;