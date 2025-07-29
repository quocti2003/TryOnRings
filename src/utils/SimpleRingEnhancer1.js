import * as THREE from 'three';

/**
 * SimpleRingEnhancer1 - Phiên bản Ruby lấp lánh và Bạch kim.
 * Kết hợp vẻ ngoài rực rỡ, chói lóa của đá Ruby với sự sang trọng,
 * bóng bẩy của đai nhẫn Bạch kim.
 */
export class SimpleRingEnhancer1 {
    constructor(renderer) {
        if (!renderer) {
            throw new Error("SimpleRingEnhancer1 yêu cầu một thực thể THREE.WebGLRenderer.");
        }
        this.renderer = renderer;
        this.envMap = null;
    }

    /**
     * Khởi tạo môi trường.
     * Rất quan trọng để tạo ra các điểm sáng cho cả Ruby và Bạch kim.
     */
    async init() {
        const canvas = document.createElement('canvas');
        const width = 256;
        const height = 128;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#111111';
        ctx.fillRect(0, 0, width, height);

        const drawSoftbox = (x, y, w, h, blur) => {
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = blur;
            ctx.fillRect(x, y, w, h);
        };

        drawSoftbox(width * 0.1, height * 0.1, width * 0.3, height * 0.8, 30);
        drawSoftbox(width * 0.7, height * 0.2, width * 0.2, height * 0.6, 25);
        drawSoftbox(0, height * 0.05, width, height * 0.1, 20);

        ctx.fillStyle = '#FFFFFF';
        ctx.shadowBlur = 0;
        ctx.fillRect(width * 0.18, height * 0.5, 2, 2);
        ctx.fillRect(width * 0.75, height * 0.4, 3, 3);
        ctx.fillRect(width * 0.5, height * 0.1, 2, 2);
        ctx.fillRect(width * 0.9, height * 0.75, 2, 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.mapping = THREE.EquirectangularReflectionMapping;

        const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        pmremGenerator.compileEquirectangularShader();
        this.envMap = pmremGenerator.fromEquirectangular(texture).texture;

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
                    name.includes('stone') || name.includes('crystal') || name.includes('topaz');

                if (isGemstone) {
                    // Quay trở lại vật liệu Ruby rực rỡ ban đầu
                    this._applySparklingRubyMaterial(child);
                } else {
                    // Giữ nguyên vật liệu Bạch kim cao cấp
                    this._applyPlatinumMaterial(child);
                }
            }
        });
        return model;
    }

    /**
     * === TRỞ LẠI: TẠO VẬT LIỆU RUBY "CHÓI LÓA" ===
     * Tạo vật liệu Ruby với hiệu ứng lấp lánh và tán sắc cao.
     * @param {THREE.Mesh} mesh
     */
    _applySparklingRubyMaterial(mesh) {
        mesh.material = new THREE.MeshPhysicalMaterial({
            // 1. Màu sắc: Màu đỏ Ruby rực rỡ, đầy sức sống.
            color: new THREE.Color(0xE0115F),

            metalness: 0.0,

            // 2. Bề mặt: Siêu mịn để tạo phản chiếu sắc nét, lấp lánh.
            roughness: 0.01,

            // 3. Độ trong suốt & Khúc xạ: Tạo chiều sâu và bẻ cong ánh sáng một cách chân thực.
            transmission: 0.95,
            ior: 1.77,
            thickness: 2.0,

            // 4. "Lửa": Tăng mạnh độ tán sắc để tạo hiệu ứng cầu vồng rực rỡ.
            dispersion: 0.25,

            // 5. Độ chói: Khuếch đại phản chiếu để tạo các tia sáng "chói chang".
            envMap: this.envMap,
            envMapIntensity: 10,
        });
    }

    /**
     * Vật liệu Bạch kim cao cấp (giữ nguyên).
     * @param {THREE.Mesh} mesh
     */
    _applyPlatinumMaterial(mesh) {
        mesh.material = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(0xE5E5E5),
            metalness: 1.0,
            roughness: 0.1,
            clearcoat: 1.0,
            clearcoatRoughness: 0.1,
            envMap: this.envMap,
            envMapIntensity: 2.0,
        });
    }
}