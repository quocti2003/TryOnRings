// src/utils/LightweightRingEnhancer.js

import * as THREE from 'three';
// THAY ĐỔI 1: Không dùng RGBELoader nữa, dùng TextureLoader cho ảnh JPG
import { TextureLoader } from 'three/src/loaders/TextureLoader.js';

/**
 * SimpleRingEnhancer - Phiên bản SIÊU NHẸ và ỔN ĐỊNH.
 * Dùng ảnh JPG nhẹ làm môi trường, cho vẻ đẹp lấp lánh mà không gây crash.
 */
export class SimpleRingEnhancer2 {
    /**
     * @param {THREE.WebGLRenderer} renderer - Vẫn cần thiết để xử lý môi trường.
     */
    constructor(renderer) {
        if (!renderer) {
            throw new Error("SimpleRingEnhancer yêu cầu một thực thể THREE.WebGLRenderer.");
        }
        this.renderer = renderer;
        this.envMap = null;
    }

    /**
     * Tải và chuẩn bị môi trường ánh sáng từ ảnh thường (JPG/PNG).
     * @param {string} imageUrl - Đường dẫn đến file ảnh.
     */
    // THAY ĐỔI 2: Dùng file JPG siêu nhẹ làm mặc định
    async init(imageUrl = '/hdr/studio_small_03.jpg') {
        // THAY ĐỔI 3: Dùng TextureLoader
        const textureLoader = new TextureLoader();
        const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        pmremGenerator.compileEquirectangularShader();

        const envTexture = await textureLoader.loadAsync(imageUrl);
        this.envMap = pmremGenerator.fromEquirectangular(envTexture).texture;

        envTexture.dispose();
        pmremGenerator.dispose();
    }

    /**
     * Áp dụng môi trường ánh sáng vào scene.
     * @param {THREE.Scene} scene - Scene cần được chiếu sáng.
     */
    applyEnvironment(scene) {
        if (!this.envMap) {
            console.warn("Môi trường chưa được khởi tạo. Hãy gọi init() trước.");
            return;
        }
        scene.environment = this.envMap;
    }

    /**
     * Hàm chính: nhận một model thô và "phù phép" nó.
     * Tất cả logic bên trong được giữ nguyên y hệt file gốc của bạn.
     * @param {THREE.Group} model - Container chứa model nhẫn từ modelLoader.
     * @returns {THREE.Group} - Container với model đã được làm đẹp.
     */
    enhance(model) {
        if (!this.envMap) {
            console.error("LỖI: Không thể làm đẹp model nếu không có môi trường (envMap). Hãy chạy init() trước.");
            return model;
        }

        model.traverse((child) => {
            if (child.isMesh) {
                this._prepareMeshGeometry(child);
                const materialType = this._detectMaterialType(child);

                if (materialType === 'diamond') {
                    this._applySubtleDiamondMaterial(child);
                } else {
                    this._applyPlatinumMaterial(child);
                }
            }
        });
        return model;
    }

    // --- CÁC HÀM PRIVATE (GIỮ NGUYÊN Y HỆT BẢN GỐC) ---
    _prepareMeshGeometry(mesh) {
        if (mesh.geometry.attributes.color) {
            mesh.geometry.deleteAttribute("color");
        }
        mesh.geometry.computeVertexNormals();
    }

    _detectMaterialType(mesh) {
        const name = mesh.name ? mesh.name.toLowerCase() : "";
        const matName = mesh.material?.name ? mesh.material.name.toLowerCase() : "";
        const keywords = ["diamond", "gem", "stone", "crystal", "brilliant", "round", "cut", "jewel"];

        if (keywords.some(kw => name.includes(kw) || matName.includes(kw))) return 'diamond';
        if (mesh.material && (mesh.material.transparent || mesh.material.opacity < 1.0)) return 'diamond';
        return 'metal';
    }

    _applySubtleDiamondMaterial(mesh) {
        mesh.material = new THREE.MeshPhysicalMaterial({
            metalness: 0.1,
            color: 0x9B111E, // Màu đỏ sẫm của Ruby
            roughness: 0.1,
            transmission: 1.0,
            ior: 2.417,
            thickness: 1.5,
            envMap: this.envMap,
            envMapIntensity: 2.5, // Có thể tăng nhẹ để bù lại độ sáng của JPG
            iridescence: 0.5,
            iridescenceIOR: 1.5,
            iridescenceThicknessRange: [100, 200],
        });
    }

    _applyPlatinumMaterial(mesh) {
        mesh.material = new THREE.MeshPhysicalMaterial({
            color: 0xE5E4E2,
            metalness: 1.0,
            roughness: 0.12,
            envMap: this.envMap,
            envMapIntensity: 1.5, // Có thể tăng nhẹ để bù lại độ sáng của JPG
            clearcoat: 0.8,
            clearcoatRoughness: 0.1,
        });
    }
}