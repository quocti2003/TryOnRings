// src/utils/SilverRingEnhancer.js

import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

/**
 * SilverRingEnhancer - Phiên bản chuyên dụng cho nhẫn Bạch kim.
 * Tạo ra vẻ đẹp tinh tế, sang trọng, không quá chói.
 */
export class SilverRingEnhancer {
  /**
   * @param {THREE.WebGLRenderer} renderer - Cần thiết để xử lý môi trường HDR.
   */
  constructor(renderer) {
    if (!renderer) {
      throw new Error("SilverRingEnhancer yêu cầu một thực thể THREE.WebGLRenderer.");
    }
    this.renderer = renderer;
    this.envMap = null;
  }

  /**
   * Tải và chuẩn bị môi trường ánh sáng.
   * @param {string} hdrUrl - Đường dẫn đến file .hdr.
   */
  async init(hdrUrl = '/hdr/studio_small_03_4k.hdr') { // Dùng HDR studio dịu nhẹ
    const rgbeLoader = new RGBELoader();
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();

    const hdrTexture = await rgbeLoader.loadAsync(hdrUrl);
    this.envMap = pmremGenerator.fromEquirectangular(hdrTexture).texture;

    hdrTexture.dispose();
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
          this._applySubtleDiamondMaterial(child); // Dùng vật liệu kim cương "dịu" hơn
        } else {
          this._applyPlatinumMaterial(child); // Chỉ áp dụng vật liệu bạch kim
        }
      }
    });
    return model;
  }

  // --- CÁC HÀM PRIVATE ---
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

  /**
   * [TINH CHỈNH] Vật liệu kim cương với độ lấp lánh và độ sáng dịu hơn.
   */
  _applySubtleDiamondMaterial(mesh) {
    mesh.material = new THREE.MeshPhysicalMaterial({
      metalness: 0.0,
      roughness: 0.05, // <-- TĂNG một chút để làm mềm phản chiếu
      transmission: 1.0,
      ior: 2.417,
      thickness: 1.5,
      envMap: this.envMap,
      // === GIẢM ĐỘ CHÓI ===
      envMapIntensity: 1.8, // GIẢM: Cường độ phản chiếu từ môi trường (từ 5.0 xuống 1.8)
      
      // === GIẢM HIỆU ỨNG 7 SẮC CẦU VỒNG ===
      iridescence: 0.5, // GIẢM: Độ mạnh của hiệu ứng óng ánh (từ 1.0 xuống 0.5)
      iridescenceIOR: 1.5, // GIẢM: Chỉ số khúc xạ của lớp óng ánh
      iridescenceThicknessRange: [100, 200], // GIẢM: Dải độ dày hẹp hơn
    });
  }

  /**
   * [TINH CHỈNH] Vật liệu bạch kim với độ bóng vừa phải.
   */
  _applyPlatinumMaterial(mesh) {
    mesh.material = new THREE.MeshPhysicalMaterial({
      color: 0xE5E4E2, // Màu bạch kim
      metalness: 1.0,
      roughness: 0.12, // <-- TĂNG một chút để kim loại không quá bóng như gương
      envMap: this.envMap,
      // === GIẢM ĐỘ SÁNG ===
      envMapIntensity: 1.0, // GIẢM: Cường độ phản chiếu (từ 1.5 xuống 1.0)
      clearcoat: 0.8, // GIẢM: Lớp sơn bóng mỏng hơn
      clearcoatRoughness: 0.1,
    });
  }
}