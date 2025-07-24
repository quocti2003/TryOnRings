// src/utils/SimpleRingEnhancer3.js

import * as THREE from 'three';

/**
 * SimpleRingEnhancer3 - SIÊU NHẸ cho ngrok, chỉ 2 màu cơ bản.
 * Tối ưu hiệu suất tối đa, không crash, chỉ focus vào ổn định.
 */
export class SimpleRingEnhancer3 {
    constructor() {
        // Không cần renderer, không cần HDR, không cần environment map phức tạp
        this.isInitialized = false;
        this.metalMeshes = [];
        this.gemMeshes = [];

        // ✅ CHỈ 2 MÀU DUY NHẤT - SIÊU ĐỘN GIẢN
        this.materials = {
            platinum: new THREE.MeshStandardMaterial({
                color: 0xE5E4E2,
                metalness: 1.0,
                roughness: 0.15,
                // Không dùng clearcoat, envMap để giảm tải
            }),
            ruby: new THREE.MeshStandardMaterial({
                color: 0x9B111E,
                metalness: 0.0,
                roughness: 0.1,
                transparent: true,
                opacity: 0.85,
                // Không dùng transmission, iridescence để tránh crash
            })
        };
    }

    /**
     * Khởi tạo - Không cần async, không cần tải file
     */
    init() {
        console.log('✅ SimpleRingEnhancer3 initialized (ultra lightweight)');
        return Promise.resolve();
    }

    /**
     * Không cần environment - Dùng ánh sáng cơ bản của scene
     */
    applyEnvironment(scene) {
        // Không làm gì cả - để scene tự xử lý lighting
        console.log('✅ Using scene default lighting (no environment)');
    }

    /**
     * Phân tích model một lần duy nhất
     */
    enhance(model) {
        if (this.isInitialized) {
            console.log('⚠️ Model already enhanced, skipping...');
            return model;
        }

        let metalCount = 0;
        let gemCount = 0;

        model.traverse((child) => {
            if (child.isMesh) {
                // Cleanup geometry
                if (child.geometry.attributes.color) {
                    child.geometry.deleteAttribute("color");
                }
                if (!child.geometry.attributes.normal) {
                    child.geometry.computeVertexNormals();
                }

                // Detect material type
                const isGem = this._isGemMesh(child);

                if (isGem) {
                    // ✅ Áp dụng Ruby material
                    child.material = this.materials.ruby.clone();
                    this.gemMeshes.push(child);
                    gemCount++;
                } else {
                    // ✅ Áp dụng Platinum material  
                    child.material = this.materials.platinum.clone();
                    this.metalMeshes.push(child);
                    metalCount++;
                }
            }
        });

        console.log(`✅ Enhanced model: ${metalCount} metal parts, ${gemCount} gems`);
        this.isInitialized = true;
        return model;
    }

    /**
     * Chuyển đổi kim loại - CHỈ PLATINUM
     */
    setMetalType(type) {
        if (type !== 'platinum') {
            console.warn('⚠️ Only platinum supported in ultra lightweight mode');
            return;
        }

        // Đã áp dụng từ đầu rồi, không cần làm gì
        console.log('✅ Platinum already applied');
    }

    /**
     * Chuyển đổi đá quý - CHỈ RUBY
     */
    setGemType(type) {
        if (type !== 'ruby') {
            console.warn('⚠️ Only ruby supported in ultra lightweight mode');
            return;
        }

        // Đã áp dụng từ đầu rồi, không cần làm gì
        console.log('✅ Ruby already applied');
    }

    /**
     * Update sparkle - Không làm gì để tránh lag
     */
    updateSparkle(time) {
        // Không có hiệu ứng sparkle để tránh crash
        // Chỉ để tương thích với interface cũ
    }

    /**
     * Detect gem mesh - Logic đơn giản nhất
     */
    _isGemMesh(mesh) {
        const name = mesh.name ? mesh.name.toLowerCase() : "";
        const matName = mesh.material?.name ? mesh.material.name.toLowerCase() : "";

        // Chỉ check một số keywords cơ bản
        const gemKeywords = ["diamond", "gem", "stone", "crystal"];

        return gemKeywords.some(keyword =>
            name.includes(keyword) || matName.includes(keyword)
        );
    }

    /**
     * Lấy danh sách options - Chỉ trả về 2 option cố định
     */
    getMetalOptions() {
        return [
            { key: 'platinum', name: 'Bạch Kim', color: '#E5E4E2' }
        ];
    }

    getGemOptions() {
        return [
            { key: 'ruby', name: 'Ruby', color: '#9B111E' }
        ];
    }
}
