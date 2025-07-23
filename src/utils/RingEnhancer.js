// Ring Enhancement Utilities for 3D Model Beautification
import * as THREE from "three";

/**
 * Tăng cường và làm đẹp mô hình nhẫn 3D
 *
 * Chức năng chính:
 * - Tự động phát hiện và phân loại các phần kim loại và kim cương
 * - Áp dụng vật liệu vật lý chất lượng cao cho từng loại vật liệu
 * - Tối ưu hóa ánh sáng và phản xạ để nhẫn trông thật và bắt mắt
 * - Loại bỏ các thuộc tính không cần thiết có thể ảnh hưởng đến chất lượng hiển thị
 */
export class RingEnhancer {
  constructor(envMap = null) {
    this.envMap = envMap;
    this.enhancedMeshes = new Set(); // Theo dõi các mesh đã được tăng cường
  }

  /**
   * Tăng cường các mesh kim cương trong mô hình nhẫn
   * Chỉ xử lý các mesh được phát hiện là kim cương, không chạm vào kim loại
   * @param {THREE.Object3D} model - Mô hình nhẫn cần tăng cương
   * @param {THREE.Texture} envMap - Environment map cho phản xạ (tùy chọn)
   */
  enhanceRingModel(model, envMap = null) {
    if (!model) {
      console.warn("RingEnhancer: Không có mô hình để tăng cường");
      return;
    }

    if (envMap) {
      this.envMap = envMap;
    }

    console.log("🔧 Bắt đầu tăng cường kim cương trong nhẫn...");

    model.traverse((child) => {
      if (child.isMesh) {
        // Chỉ tăng cường các mesh kim cương, bỏ qua kim loại
        const materialType = this._detectMaterialType(child);
        if (materialType === "diamond") {
          this._enhanceDiamondMesh(child);
        }
      }
    });

    console.log(
      `✨ Hoàn thành tăng cường ${this.enhancedMeshes.size} mesh kim cương`
    );
  }

  /**
   * Tăng cường một mesh kim cương cụ thể
   * @private
   */
  _enhanceDiamondMesh(mesh) {
    // Chuẩn bị mesh cho việc tăng cường
    this._prepareMeshGeometry(mesh);

    // Áp dụng vật liệu kim cương
    this._applyDiamondMaterial(mesh);
    mesh.userData.isDiamond = true;
    mesh.userData.isMetal = false;

    // Tối ưu hóa rendering
    this._optimizeMeshRendering(mesh);

    this.enhancedMeshes.add(mesh);

    console.log(`💎 Tăng cường kim cương: ${mesh.name || "mesh"}`);
  }

  /**
   * Chuẩn bị geometry của mesh
   * @private
   */
  _prepareMeshGeometry(mesh) {
    // Loại bỏ vertex colors có thể gây xung đột
    if (mesh.geometry.attributes.color) {
      mesh.geometry.deleteAttribute("color");
    }

    // Tính toán lại normals để có ánh sáng chính xác
    mesh.geometry.computeVertexNormals();

    // Tắt shadows để có hiệu suất tốt hơn với mirror effect
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  }

  /**
   * Phát hiện loại vật liệu dựa trên tên và thuộc tính
   * @private
   */
  _detectMaterialType(mesh) {
    const name = mesh.name ? mesh.name.toLowerCase() : "";
    const materialName =
      mesh.material && mesh.material.name
        ? mesh.material.name.toLowerCase()
        : "";

    // Kiểm tra các từ khóa kim cương
    const diamondKeywords = [
      "diamond",
      "gem",
      "stone",
      "crystal",
      "brilliant",
      "round",
      "cut",
      "jewel",
      "precious",
    ];

    const isDiamondByName = diamondKeywords.some(
      (keyword) => name.includes(keyword) || materialName.includes(keyword)
    );

    // Kiểm tra thuộc tính vật liệu (kim cương thường trong suốt)
    const isDiamondByProperties =
      mesh.material &&
      (mesh.material.transparent ||
        mesh.material.opacity < 1.0 ||
        (mesh.material.color &&
          mesh.material.color.r > 0.8 &&
          mesh.material.color.g > 0.8 &&
          mesh.material.color.b > 0.8));

    return isDiamondByName || isDiamondByProperties ? "diamond" : "metal";
  }

  /**
   * Áp dụng vật liệu kim cương chất lượng cao
   * Tạo hiệu ứng như opal/moonstone với độ trong mờ đẹp mắt
   * @private
   */
  _applyDiamondMaterial(mesh) {
    mesh.material = new THREE.MeshPhysicalMaterial({
      // Màu trắng tinh khiết
      color: 0xffffff,

      // Không phải kim loại
      metalness: 0.0,

      // Độ nhám vừa phải để tạo hiệu ứng mờ như opal
      roughness: 0.2,

      // Transmission cao cho hiệu ứng trong suốt
      transmission: 0.9,
      transparent: true,
      opacity: 1.0,

      // IOR của opal/moonstone (không phải kim cương)
      ior: 1.45,

      // Phản xạ vừa phải
      reflectivity: 0.5,

      // Tăng cường environment mapping
      envMapIntensity: 1.5,

      // Clearcoat nhẹ
      clearcoat: 0.3,
      clearcoatRoughness: 0.2,

      // Tạo hiệu ứng tán xạ ánh sáng bên trong (milky effect)
      thickness: 2.0,
      attenuationColor: new THREE.Color(0xffffff),
      attenuationDistance: 0.5,

      // Render cả hai mặt
      side: THREE.DoubleSide,

      // Đảm bảo rendering nhất quán
      flatShading: false,
      vertexColors: false,
    });

    // Áp dụng environment map nếu có
    if (this.envMap) {
      mesh.material.envMap = this.envMap;
    }

    mesh.material.needsUpdate = true;

    console.log(
      `💎 Áp dụng vật liệu kim cương opal cho: ${mesh.name || "mesh"}`
    );
  }

  /**
   * Áp dụng vật liệu kim loại chất lượng cao (rose gold mặc định)
   * @private
   */
  _applyMetalMaterial(mesh, metalType = "rose-gold") {
    const metalConfigs = {
      "rose-gold": {
        color: 0xeecdae,
        metalness: 1.0,
        roughness: 0.15,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        envMapIntensity: 2.0,
      },
      gold: {
        color: 0xffd700,
        metalness: 0.8,
        roughness: 0.2,
        clearcoat: 0.8,
        clearcoatRoughness: 0.15,
        envMapIntensity: 1.0,
      },
      silver: {
        color: 0xc0c0c0,
        metalness: 0.9,
        roughness: 0.1,
        clearcoat: 0.9,
        clearcoatRoughness: 0.1,
        envMapIntensity: 1.2,
      },
      platinum: {
        color: 0xe5e4e2,
        metalness: 0.9,
        roughness: 0.15,
        clearcoat: 0.85,
        clearcoatRoughness: 0.12,
        envMapIntensity: 1.1,
      },
    };

    const config = metalConfigs[metalType] || metalConfigs["rose-gold"];

    mesh.material = new THREE.MeshPhysicalMaterial({
      color: config.color,
      metalness: config.metalness,
      roughness: config.roughness,
      clearcoat: config.clearcoat,
      clearcoatRoughness: config.clearcoatRoughness,
      envMapIntensity: config.envMapIntensity,
    });

    // Áp dụng environment map nếu có
    if (this.envMap) {
      mesh.material.envMap = this.envMap;
    }

    mesh.material.needsUpdate = true;

    console.log(`🥇 Áp dụng vật liệu ${metalType} cho: ${mesh.name || "mesh"}`);
  }

  /**
   * Tối ưu hóa rendering cho mesh
   * @private
   */
  _optimizeMeshRendering(mesh) {
    // Tắt shadows để tương thích với mirror effect
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    // Đảm bảo mesh được render với độ ưu tiên phù hợp
    mesh.renderOrder = mesh.userData.isDiamond ? 1 : 0;
  }

  /**
   * Lưu ý: RingEnhancer chỉ xử lý kim cương
   * Để thay đổi vật liệu kim loại, cần sử dụng các method khác trong ThreeJSViewer
   */
  setMetalMaterial(metalType = "rose-gold") {
    console.warn(
      "RingEnhancer chỉ xử lý kim cương. Sử dụng ThreeJSViewer methods để thay đổi kim loại."
    );
  }

  /**
   * Áp dụng vật liệu kim cương tiêu chuẩn (trong suốt hoàn toàn)
   */
  setStandardDiamondMaterial() {
    this.enhancedMeshes.forEach((mesh) => {
      if (mesh.userData.isDiamond) {
        mesh.material = new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          metalness: 0.0,
          roughness: 0.0,
          transmission: 0.99,
          transparent: true,
          opacity: 0.98,
          reflectivity: 1.0,
          envMapIntensity: 2.0,
          clearcoat: 1.0,
          clearcoatRoughness: 0.0,
          ior: 2.42, // Diamond IOR
          thickness: 0.1,
          attenuationDistance: 0.1,
          attenuationColor: new THREE.Color(0xffffff),
          side: THREE.DoubleSide,
        });

        if (this.envMap) {
          mesh.material.envMap = this.envMap;
        }

        mesh.material.needsUpdate = true;
      }
    });

    console.log("💎 Đã áp dụng vật liệu kim cương tiêu chuẩn");
  }

  /**
   * Buộc tất cả các mesh có thể là kim cương thành kim cương
   */
  forceAllPotentialDiamondsUniform() {
    // Tìm tất cả mesh có thể là kim cương
    const potentialDiamonds = Array.from(this.enhancedMeshes).filter((mesh) => {
      const name = mesh.name ? mesh.name.toLowerCase() : "";
      const materialName =
        mesh.material && mesh.material.name
          ? mesh.material.name.toLowerCase()
          : "";

      return (
        name.includes("diamond") ||
        name.includes("gem") ||
        name.includes("stone") ||
        name.includes("crystal") ||
        materialName.includes("diamond") ||
        materialName.includes("gem") ||
        materialName.includes("crystal") ||
        name.includes("brilliant") ||
        name.includes("round") ||
        name.includes("cut") ||
        (mesh.material &&
          mesh.material.color &&
          mesh.material.color.r > 0.8 &&
          mesh.material.color.g > 0.8 &&
          mesh.material.color.b > 0.8) ||
        (mesh.material && mesh.material.transparent) ||
        (mesh.material && mesh.material.opacity < 1.0)
      );
    });

    // Áp dụng vật liệu kim cương thống nhất
    potentialDiamonds.forEach((mesh) => {
      mesh.userData.isDiamond = true;
      mesh.userData.isMetal = false;

      mesh.material = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.0,
        roughness: 0.0,
        transmission: 0.98,
        transparent: true,
        opacity: 0.95,
        reflectivity: 1.0,
        envMapIntensity: 3.5,
        clearcoat: 1.0,
        clearcoatRoughness: 0.0,
        ior: 2.42,
        thickness: 0.3,
        attenuationDistance: 0.3,
        attenuationColor: new THREE.Color(0xffffff),
        side: THREE.DoubleSide,
      });

      if (this.envMap) {
        mesh.material.envMap = this.envMap;
      }

      mesh.material.needsUpdate = true;
    });

    console.log(
      `🔧 Đã buộc ${potentialDiamonds.length} mesh thành kim cương thống nhất`
    );
  }

  /**
   * Reset về vật liệu kim cương gốc (opal/moonstone style)
   */
  resetToOriginalMaterials() {
    this.enhancedMeshes.forEach((mesh) => {
      if (mesh.userData.isDiamond) {
        this._applyDiamondMaterial(mesh);
      }
    });
    console.log("🔄 Đã reset kim cương về vật liệu gốc");
  }

  /**
   * Lấy thống kê về các mesh đã tăng cường
   */
  getEnhancementStats() {
    const stats = {
      total: this.enhancedMeshes.size,
      diamonds: 0,
      metals: 0,
    };

    this.enhancedMeshes.forEach((mesh) => {
      if (mesh.userData.isDiamond) {
        stats.diamonds++;
      } else if (mesh.userData.isMetal) {
        stats.metals++;
      }
    });

    return stats;
  }

  /**
   * Dọn dẹp tài nguyên
   */
  dispose() {
    this.enhancedMeshes.clear();
    this.envMap = null;
    console.log("🧹 Đã dọn dẹp RingEnhancer");
  }
}

/**
 * Hàm tiện ích để tạo và sử dụng RingEnhancer
 */
export const enhanceRingModel = (model, envMap = null) => {
  const enhancer = new RingEnhancer(envMap);
  enhancer.enhanceRingModel(model, envMap);
  return enhancer;
};

export default RingEnhancer;

// // Three.js đã load studio_small_03_4k.hdr trong setupEnvironment() và truyền vào RingEnhancer thông qua:

//   // Trong loadModel() của Three.js
//   this.ringEnhancer = new RingEnhancer(this.envMap);
//   this.ringEnhancer.enhanceRingModel(this.model, this.envMap);

//   RingEnhancer chỉ việc nhận và sử dụng envMap đã được chuẩn bị sẵn
