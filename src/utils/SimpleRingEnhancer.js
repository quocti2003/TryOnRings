import * as THREE from 'three';

/**
 * SimpleRingEnhancer - Phiên bản NÂNG CAO & SIÊU NHẸ.
 * Tạo ra hiệu ứng hình ảnh chân thực bằng cách mô phỏng môi trường studio
 * và sử dụng các thuộc tính vật liệu vật lý nâng cao.
 * Vẫn không cần tải bất kỳ file external nào, đảm bảo hiệu năng tối đa.
 */
export class SimpleRingEnhancer {
  constructor(renderer) {
    if (!renderer) {
      throw new Error("SimpleRingEnhancer yêu cầu một thực thể THREE.WebGLRenderer.");
    }
    this.renderer = renderer;
    this.envMap = null;
  }

  /**
   * Khởi tạo môi trường.
   * Tạo ra một envMap procedural với các điểm sáng nhỏ, siêu nét để tạo hiệu ứng "lóe sáng".
   * (Phần này giữ nguyên như phiên bản trước vì nó đã rất tốt cho việc tạo lấp lánh)
   */
  async init() {
    const canvas = document.createElement('canvas');
    const width = 256;
    const height = 128;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Nền tối để tạo tương phản
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, width, height);

    // Hàm tiện ích để vẽ các softbox (nguồn sáng mềm)
    const drawSoftbox = (x, y, w, h, blur) => {
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = blur;
      ctx.fillRect(x, y, w, h);
    };

    // Vẽ các nguồn sáng mềm mô phỏng studio
    ctx.shadowBlur = 0;
    drawSoftbox(width * 0.1, height * 0.1, width * 0.3, height * 0.8, 30);
    drawSoftbox(width * 0.7, height * 0.2, width * 0.2, height * 0.6, 25);
    drawSoftbox(0, height * 0.05, width, height * 0.1, 20);

    // Thêm các điểm sáng nhỏ, sắc nét để tạo ra các tia "lóe sáng" (glints)
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowBlur = 0;
    ctx.fillRect(width * 0.18, height * 0.5, 2, 2);
    ctx.fillRect(width * 0.75, height * 0.4, 3, 3);
    ctx.fillRect(width * 0.5, height * 0.1, 2, 2);
    ctx.fillRect(width * 0.9, height * 0.75, 2, 2);

    // Tạo envMap từ canvas đã vẽ
    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();
    this.envMap = pmremGenerator.fromEquirectangular(texture).texture;

    // Dọn dẹp
    texture.dispose();
    pmremGenerator.dispose();
  }

  /**
   * Áp dụng môi trường đã tạo vào scene.
   */
  applyEnvironment(scene) {
    if (this.envMap) {
      scene.environment = this.envMap;
    }
  }

  /**
   * "Phù phép" model thô để trở nên đẹp hơn.
   */
  enhance(model) {
    if (!this.envMap) {
      console.warn("Môi trường chưa được khởi tạo. Kết quả có thể không như ý.");
    }

    model.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry.attributes.color) {
          child.geometry.deleteAttribute("color");
        }
        child.geometry.computeVertexNormals();

        const name = (child.name || '').toLowerCase();
        const isGemstone = name.includes('diamond') || name.includes('gem') ||
          name.includes('stone') || name.includes('crystal');

        if (isGemstone) {
          // === UPDATE: Áp dụng vật liệu Ruby "chói lóa" ===
          this._applySparklingRubyMaterial(child);
        } else {
          this._applyPlatinumMaterial(child);
        }
      }
    });
    return model;
  }

  /**
   * === UPDATE: TẠO VẬT LIỆU RUBY "CHÓI LÓA" ===
   * Tạo vật liệu Ruby nhưng với hiệu ứng lấp lánh và tán sắc cao.
   * @param {THREE.Mesh} mesh
   */
  _applySparklingRubyMaterial(mesh) {
    mesh.material = new THREE.MeshPhysicalMaterial({
      // 1. Màu sắc: Đặt màu đỏ Ruby làm nền tảng
      color: new THREE.Color(0xE0115F),

      metalness: 0.0,
      roughness: 0.01,           // Bề mặt siêu mịn để phản chiếu sắc nét

      // 2. Độ trong suốt: Rất trong suốt nhưng không hoàn toàn 100%
      // Điều này giúp giữ lại màu đỏ đậm đặc trưng của Ruby
      transmission: 0.95,

      // 3. Khúc xạ: Sử dụng chỉ số khúc xạ thực tế của Ruby
      ior: 1.77,
      thickness: 2.0,            // Tăng độ dày ảo để hiệu ứng khúc xạ và màu sắc sâu hơn

      // 4. "Lửa" lấp lánh: Đây là "phép thuật" chính!
      // Ta "gian lận" một chút bằng cách tăng mạnh độ tán sắc để tạo hiệu ứng cầu vồng.
      dispersion: 0.25,

      // 5. Độ chói: Tăng cường độ phản chiếu môi trường lên MỨC TỐI ĐA
      // để viên Ruby "bắt" lấy những điểm sáng nhỏ và "lóe" lên.
      envMap: this.envMap,
      envMapIntensity: 10,
    });
  }

  /**
   * Tạo vật liệu kim loại Platinum (bạch kim) cao cấp (giữ nguyên).
   * @param {THREE.Mesh} mesh
   */
  _applyPlatinumMaterial(mesh) {
    mesh.material = new THREE.MeshPhysicalMaterial({
      color: 0xB76E79,
      metalness: 1.0,
      roughness: 0.1,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      envMap: this.envMap,
      envMapIntensity: 1.5,
    });
  }
}