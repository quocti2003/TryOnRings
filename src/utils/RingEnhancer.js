// src/utils/RingEnhancer.js (Phiên bản "CAO CẤP" hoàn chỉnh)

import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

/**
 * RingEnhancer - Phiên bản Cao Cấp
 * Kết hợp những tinh hoa để tự động làm đẹp mô hình nhẫn 3D.
 * - Tự tải và quản lý môi trường ánh sáng (HDR).
 * - Tự động phát hiện chính xác vật liệu kim loại và đá quý.
 * - Áp dụng các "công thức" vật liệu PBR cao cấp cho độ chân thực tối đa.
 * - Cung cấp các hàm để thay đổi vật liệu kim loại một cách linh hoạt.
 */
export class RingEnhancer {
  /**
   * @param {THREE.WebGLRenderer} renderer - Cần thiết để xử lý môi trường HDR.
   */
  constructor(renderer) {
    if (!renderer) {
      throw new Error("RingEnhancer yêu cầu một thực thể THREE.WebGLRenderer.");
    }
    this.renderer = renderer;
    this.envMap = null; // Môi trường ánh sáng (HDR) sẽ được lưu ở đây
    this.model = null; // Tham chiếu đến model đã được enhance
  }

  /**
   * Tải và chuẩn bị môi trường ánh sáng từ file HDR.
   * @param {string} hdrUrl - Đường dẫn đến file .hdr trong thư mục /public.
   */
  async init(hdrUrl = '/hdr/photo_studio_01_4k.hdr') {
    const rgbeLoader = new RGBELoader();
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();

    const hdrTexture = await rgbeLoader.loadAsync(hdrUrl);
    this.envMap = pmremGenerator.fromEquirectangular(hdrTexture).texture;

    hdrTexture.dispose();
    pmremGenerator.dispose();
    console.log("✨ Môi trường ánh sáng HDR CAO CẤP đã sẵn sàng!");
  }

  /**
   * Áp dụng môi trường ánh sáng (nhưng không phải nền) vào scene.
   * @param {THREE.Scene} scene - Scene cần được chiếu sáng.
   */
  applyEnvironment(scene) {
    if (!this.envMap) {
      console.warn("RingEnhancer: Môi trường chưa được khởi tạo. Hãy gọi init() trước.");
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

    this.model = model;

    model.traverse((child) => {
      if (child.isMesh) {
        this._prepareMeshGeometry(child);
        const materialType = this._detectMaterialType(child);
        if (materialType === 'diamond') {
          this._applyDiamondMaterial(child);
          child.userData.isDiamond = true;
        } else {
          this._applyMetalMaterial(child, 'rose-gold');
          child.userData.isMetal = true;
        }
      }
    });

    console.log("💎✨ Hoàn thành làm đẹp mô hình nhẫn ở cấp độ CAO CẤP!");
    return model;
  }

  /**
   * [Private] Chuẩn bị hình học của mesh để đảm bảo render đẹp nhất.
   */
  _prepareMeshGeometry(mesh) {
    if (mesh.geometry.attributes.color) {
      mesh.geometry.deleteAttribute("color");
    }
    mesh.geometry.computeVertexNormals();
  }

  /**
   * [Private] Logic phát hiện vật liệu thông minh.
   * @returns {'diamond' | 'metal'}
   */
  _detectMaterialType(mesh) {
    const name = mesh.name ? mesh.name.toLowerCase() : "";
    const matName = mesh.material?.name ? mesh.material.name.toLowerCase() : "";
    const keywords = ["diamond", "gem", "stone", "crystal", "brilliant", "round", "cut", "jewel"];

    if (keywords.some(kw => name.includes(kw) || matName.includes(kw))) {
      return 'diamond';
    }
    
    if (mesh.material && (mesh.material.transparent || mesh.material.opacity < 1.0)) {
        return 'diamond';
    }

    return 'metal';
  }

  /**
   * [NÂNG CẤP] Áp dụng vật liệu Kim Cương với hiệu ứng "LỬA" (Tán sắc).
   */
  _applyDiamondMaterial(mesh) {
    console.log(`💎🔥 Áp dụng vật liệu kim cương CÓ LỬA cho: ${mesh.name || "mesh"}`);
    mesh.material = new THREE.MeshPhysicalMaterial({
      metalness: 0.0,
      roughness: 0.0,
      transmission: 1.0,
      ior: 2.417,
      thickness: 1.5,
      envMap: this.envMap,
      envMapIntensity: 5.0, // Tăng cường độ phản chiếu tối đa
      
      // --- PHÉP MÀU TẠO LỬA (TÁN SẮC) ---
      iridescence: 1.0,                 // Bật hiệu ứng óng ánh
      iridescenceIOR: 1.8,               // Chỉ số khúc xạ cho lớp óng ánh
      iridescenceThicknessRange: [100, 400], // Độ dày lớp màng tạo ra 7 sắc cầu vồng
    });
  }

  /**
   * [NÂNG CẤP] Áp dụng vật liệu Kim Loại với lớp "SƠN BÓNG".
   */
  _applyMetalMaterial(mesh, metalType = 'rose-gold') {
    console.log(`🥇✨ Áp dụng vật liệu kim loại CÓ SƠN BÓNG cho: ${mesh.name || "mesh"}`);
    const configs = {
      'rose-gold': { color: 0xB76E79, roughness: 0.1 },
      'gold': { color: 0xFFD700, roughness: 0.15 },
      'silver': { color: 0xEAEAEA, roughness: 0.05 },
      'platinum': { color: 0xE5E4E2, roughness: 0.08 },
    };
    const config = configs[metalType] || configs['rose-gold'];

    mesh.material = new THREE.MeshPhysicalMaterial({
      color: config.color,
      metalness: 1.0,
      roughness: config.roughness,
      envMap: this.envMap,
      envMapIntensity: 1.5,

      // --- LỚP SƠN BÓNG CAO CẤP ---
      clearcoat: 1.0,
      clearcoatRoughness: 0.0,
    });
  }

  /**
   * Thay đổi vật liệu của tất cả các phần kim loại trên nhẫn.
   * @param {'rose-gold' | 'gold' | 'silver' | 'platinum'} metalType - Loại kim loại muốn thay đổi.
   */
  setMetal(metalType) {
    if (!this.model) {
      console.warn("Chưa có model để thay đổi vật liệu.");
      return;
    }
    this.model.traverse((child) => {
      if (child.isMesh && child.userData.isMetal) {
        this._applyMetalMaterial(child, metalType);
      }
    });
    console.log(`🎨 Vật liệu kim loại đã được đổi thành: ${metalType}`);
  }

  setRoseGold() { this.setMetal('rose-gold'); }
  setGold() { this.setMetal('gold'); }
  setSilver() { this.setMetal('silver'); }
  setPlatinum() { this.setMetal('platinum'); }
}

export default RingEnhancer;