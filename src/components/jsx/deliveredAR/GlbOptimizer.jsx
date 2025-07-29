import React, { useState, useCallback, useEffect } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import * as THREE from 'three';
import './GlbInspector.css';

const GlbOptimizer = () => {
    const [originalData, setOriginalData] = useState(null);
    const [optimizedData, setOptimizedData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [fileName, setFileName] = useState('');
    const [originalSize, setOriginalSize] = useState(0);
    const [optimizedSize, setOptimizedSize] = useState(0);
    const [progress, setProgress] = useState('');

    useEffect(() => {
        document.body.style.overflow = 'auto';
        return () => {
            document.body.style.overflow = 'initial';
        };
    }, []);

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const optimizeTextures = (gltf) => {
        setProgress('Optimizing textures...');
        
        // Optimize textures by reducing resolution
        if (gltf.parser.json.images) {
            gltf.parser.json.images.forEach((image, index) => {
                if (gltf.parser.textureCache && gltf.parser.textureCache[index]) {
                    const texture = gltf.parser.textureCache[index];
                    if (texture.image) {
                        // Create canvas to resize image
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        
                        // Aggressive reduction to max 512x512 for extreme compression
                        const maxSize = 512;
                        const { width, height } = texture.image;
                        const scale = Math.min(maxSize / width, maxSize / height, 1);
                        
                        canvas.width = width * scale;
                        canvas.height = height * scale;
                        
                        ctx.drawImage(texture.image, 0, 0, canvas.width, canvas.height);
                        
                        // Convert to very low quality JPEG for maximum compression
                        const dataURL = canvas.toDataURL('image/jpeg', 0.3);
                        texture.image.src = dataURL;
                    }
                }
            });
        }
    };

    const separateMeshes = (gltf) => {
        setProgress('Separating meshes...');
        
        const scene = gltf.scene;
        const meshGroups = { flower: [], ring: [] };
        
        // Traverse the scene to find meshes
        scene.traverse((child) => {
            if (child.isMesh) {
                const name = child.name.toLowerCase();
                
                // Classify meshes based on name or position
                if (name.includes('flower') || name.includes('hoa') || name.includes('petal') || 
                    name.includes('leaf') || name.includes('bloom')) {
                    meshGroups.flower.push(child);
                } else if (name.includes('ring') || name.includes('band') || name.includes('nhan') ||
                          name.includes('dai') || child.position.y < 0.5) {
                    meshGroups.ring.push(child);
                } else {
                    // Auto-classify based on geometry bounds
                    const box = new THREE.Box3().setFromObject(child);
                    const center = box.getCenter(new THREE.Vector3());
                    
                    // If mesh is higher up, likely part of flower
                    if (center.y > 0.5) {
                        meshGroups.flower.push(child);
                    } else {
                        meshGroups.ring.push(child);
                    }
                }
            }
        });

        // Create separate groups
        const flowerGroup = new THREE.Group();
        flowerGroup.name = 'FlowerGroup';
        
        const ringGroup = new THREE.Group();
        ringGroup.name = 'RingGroup';
        
        meshGroups.flower.forEach(mesh => {
            flowerGroup.add(mesh.clone());
        });
        
        meshGroups.ring.forEach(mesh => {
            ringGroup.add(mesh.clone());
        });
        
        // Clear original scene and add groups
        while(scene.children.length > 0) {
            scene.remove(scene.children[0]);
        }
        
        scene.add(flowerGroup);
        scene.add(ringGroup);
        
        return { flowerCount: meshGroups.flower.length, ringCount: meshGroups.ring.length };
    };

    const optimizeGeometry = (gltf) => {
        setProgress('Optimizing geometry...');
        
        gltf.scene.traverse((child) => {
            if (child.isMesh && child.geometry) {
                // Aggressive geometry simplification
                const positions = child.geometry.attributes.position;
                if (positions && positions.count > 1000) {
                    // Very aggressive vertex reduction for extreme file size reduction
                    const originalCount = positions.count;
                    const targetCount = Math.min(originalCount, Math.max(500, originalCount / 20));
                    
                    if (originalCount > targetCount) {
                        const step = Math.floor(originalCount / targetCount);
                        const newPositions = [];
                        const newNormals = [];
                        const newUvs = [];
                        
                        for (let i = 0; i < originalCount; i += step) {
                            newPositions.push(
                                positions.getX(i),
                                positions.getY(i),
                                positions.getZ(i)
                            );
                            
                            if (child.geometry.attributes.normal) {
                                newNormals.push(
                                    child.geometry.attributes.normal.getX(i),
                                    child.geometry.attributes.normal.getY(i),
                                    child.geometry.attributes.normal.getZ(i)
                                );
                            }
                            
                            if (child.geometry.attributes.uv) {
                                newUvs.push(
                                    child.geometry.attributes.uv.getX(i),
                                    child.geometry.attributes.uv.getY(i)
                                );
                            }
                        }
                        
                        child.geometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
                        if (newNormals.length > 0) {
                            child.geometry.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
                        }
                        if (newUvs.length > 0) {
                            child.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(newUvs, 2));
                        }
                        
                        console.log(`Reduced vertices from ${originalCount} to ${newPositions.length / 3}`);
                    }
                }
                
                // Compute vertex normals if missing
                if (!child.geometry.attributes.normal) {
                    child.geometry.computeVertexNormals();
                }
            }
        });
    };

    const processGlb = useCallback((file) => {
        if (!file) return;

        setIsLoading(true);
        setError(null);
        setOriginalData(null);
        setOptimizedData(null);
        setFileName(file.name);
        setOriginalSize(file.size);
        setProgress('Loading original file...');

        const loader = new GLTFLoader();
        const objectURL = URL.createObjectURL(file);

        loader.load(
            objectURL,
            (gltf) => {
                setOriginalData(gltf);
                
                // Start optimization process
                const optimizedGltf = gltf.clone ? gltf.clone() : JSON.parse(JSON.stringify(gltf));
                
                try {
                    // Apply optimizations
                    optimizeTextures(optimizedGltf);
                    const meshInfo = separateMeshes(optimizedGltf);
                    optimizeGeometry(optimizedGltf);
                    
                    setProgress('Exporting optimized file...');
                    
                    // Export optimized GLB
                    const exporter = new GLTFExporter();
                    exporter.parse(
                        optimizedGltf.scene,
                        (result) => {
                            const blob = new Blob([result], { type: 'application/octet-stream' });
                            setOptimizedSize(blob.size);
                            setOptimizedData({
                                blob,
                                meshInfo,
                                compressionRatio: ((file.size - blob.size) / file.size * 100).toFixed(1)
                            });
                            setProgress('Optimization complete!');
                            setIsLoading(false);
                        },
                        { binary: true }
                    );
                    
                } catch (err) {
                    console.error('Optimization error:', err);
                    setError('Failed to optimize the GLB file: ' + err.message);
                    setIsLoading(false);
                }

                URL.revokeObjectURL(objectURL);
            },
            undefined,
            (err) => {
                console.error("Error loading GLB:", err);
                setError("Failed to load the GLB file. It might be invalid or corrupted.");
                setIsLoading(false);
                URL.revokeObjectURL(objectURL);
            }
        );
    }, []);

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        processGlb(file);
    };

    const handleDragOver = (event) => event.preventDefault();

    const handleDrop = (event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        processGlb(file);
    };

    const downloadOptimized = () => {
        if (optimizedData && optimizedData.blob) {
            const url = URL.createObjectURL(optimizedData.blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName.replace('.glb', 'Nen.glb');
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    };

    return (
        <div className="realism-inspector-container">
            <header className="realism-inspector-header">
                <h1>GLB Optimizer & Mesh Separator</h1>
                <p>Optimize GLB files by separating meshes and reducing file size</p>
            </header>

            <div
                className="upload-area"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => document.getElementById('file-input-optimizer').click()}
            >
                <input
                    type="file"
                    id="file-input-optimizer"
                    accept=".glb"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                />
                <p>Drag & Drop a .glb file here, or click to select.</p>
            </div>

            {isLoading && (
                <div className="status-message">
                    <div>{progress}</div>
                    <div>Processing "{fileName}"...</div>
                </div>
            )}
            
            {error && <div className="status-message error">{error}</div>}

            {originalData && optimizedData && (
                <div className="results-container">
                    <h2>Optimization Results for: <strong>{fileName}</strong></h2>
                    
                    <div className="optimization-stats">
                        <div className="stat-item">
                            <strong>Original Size:</strong> {formatFileSize(originalSize)}
                        </div>
                        <div className="stat-item">
                            <strong>Optimized Size:</strong> {formatFileSize(optimizedSize)}
                        </div>
                        <div className="stat-item">
                            <strong>Size Reduction:</strong> {optimizedData.compressionRatio}%
                        </div>
                        <div className="stat-item">
                            <strong>Flower Meshes:</strong> {optimizedData.meshInfo.flowerCount}
                        </div>
                        <div className="stat-item">
                            <strong>Ring Meshes:</strong> {optimizedData.meshInfo.ringCount}
                        </div>
                    </div>

                    <button 
                        onClick={downloadOptimized}
                        className="download-button"
                        style={{
                            padding: '10px 20px',
                            backgroundColor: '#4CAF50',
                            color: 'white',
                            border: 'none',
                            borderRadius: '5px',
                            cursor: 'pointer',
                            fontSize: '16px',
                            marginTop: '20px'
                        }}
                    >
                        Download Optimized GLB
                    </button>
                </div>
            )}
        </div>
    );
};

export default GlbOptimizer;