import React, { useState, useCallback, useEffect } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import './GlbInspector.css';

// Component con để hiển thị cây dữ liệu JSON một cách đẹp mắt
const JsonViewer = ({ data }) => {
    const formattedJson = JSON.stringify(data, null, 2);
    return (
        <pre className="json-viewer">
            <code>{formattedJson}</code>
        </pre>
    );
};

const GlbRealismInspector = () => {
    const [realismData, setRealismData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [fileName, setFileName] = useState('');

    // --- BẮT ĐẦU PHẦN SỬA LỖI CUỘN TOÀN TRANG ---
    useEffect(() => {
        // Khi component này được hiển thị, hãy BẮT BUỘC body phải cuộn được.
        // Điều này sẽ ghi đè lên bất kỳ quy tắc CSS `overflow: hidden` nào từ các trang khác.
        document.body.style.overflow = 'auto';

        // Hàm cleanup: khi component bị gỡ khỏi màn hình (unmount),
        // trả lại style về trạng thái ban đầu để không làm ảnh hưởng đến các trang khác.
        return () => {
            document.body.style.overflow = 'initial';
        };
    }, []); // Mảng rỗng [] nghĩa là effect này chỉ chạy 1 lần khi component được mount.
    // --- KẾT THÚC PHẦN SỬA LỖI ---


    const analyzeGlb = useCallback((file) => {
        if (!file) return;

        setIsLoading(true);
        setError(null);
        setRealismData(null);
        setFileName(file.name);

        const loader = new GLTFLoader();
        const objectURL = URL.createObjectURL(file);

        loader.load(
            objectURL,
            (gltf) => {
                const gltfJson = gltf.parser.json;

                const extractedData = {
                    "MATERIALS_(The 'Brain' of Realism)": gltfJson.materials || "Not found",
                    "TEXTURES_(The 'Skins')": gltfJson.textures || "Not found",
                    "IMAGES_(The Raw Pixel Data)": [],
                    "SAMPLERS_(Controls Sharpness/Blurriness)": gltfJson.samplers || "Not found",
                    "MESH_UV_CHECK_(Required for Textures)": [],
                };

                if (gltfJson.images && gltf.parser.textureCache) {
                    const imagePromises = gltfJson.images.map((img, index) => gltf.parser.loadTextureImage(index));
                    Promise.all(imagePromises).then(loadedImages => {
                        extractedData["IMAGES_(The Raw Pixel Data)"] = gltfJson.images.map((img, index) => ({
                            name: img.name || `Image ${index}`,
                            mimeType: img.mimeType,
                            size: loadedImages[index] ? `${loadedImages[index].width}x${loadedImages[index].height}` : "Unknown",
                            uri: img.uri ? `${img.uri.substring(0, 70)}...` : "Embedded in buffer"
                        }));

                        if (gltfJson.meshes) {
                            extractedData["MESH_UV_CHECK_(Required for Textures)"] = gltfJson.meshes.map((mesh, index) => ({
                                meshName: mesh.name || `Mesh ${index}`,
                                hasUVs: mesh.primitives.some(p => p.attributes.TEXCOORD_0 !== undefined)
                            }));
                        }

                        setRealismData(extractedData);
                        setIsLoading(false);
                    });

                } else {
                    setRealismData(extractedData);
                    setIsLoading(false);
                }

                URL.revokeObjectURL(objectURL);
            },
            undefined,
            (err) => {
                console.error("Error loading GLB:", err);
                setError("Failed to load or parse the GLB file. It might be invalid or corrupted.");
                setIsLoading(false);
                URL.revokeObjectURL(objectURL);
            }
        );
    }, []);

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        analyzeGlb(file);
    };

    const handleDragOver = (event) => event.preventDefault();

    const handleDrop = (event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        analyzeGlb(file);
    };

    return (
        <div className="realism-inspector-container">
            <header className="realism-inspector-header">
                <h1>GLB Realism Inspector</h1>
                <p>Focus on data that impacts visual quality, sharpness, and realism.</p>
            </header>

            <div
                className="upload-area"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => document.getElementById('file-input-realism').click()}
            >
                <input
                    type="file"
                    id="file-input-realism"
                    accept=".glb"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                />
                <p>Drag & Drop a .glb file here, or click to select.</p>
            </div>

            {isLoading && <div className="status-message">Extracting realism data from "{fileName}"...</div>}
            {error && <div className="status-message error">{error}</div>}

            {realismData && (
                <div className="results-container">
                    <h2>Realism-Critical Data for: <strong>{fileName}</strong></h2>
                    {Object.entries(realismData).map(([key, value]) => (
                        <div key={key} className="data-section">
                            <h3>{key.replace(/_/g, ' ')}</h3>
                            <JsonViewer data={value} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default GlbRealismInspector;