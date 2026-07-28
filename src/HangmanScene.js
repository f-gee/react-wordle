import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as CANNON from "cannon-es";

/**
 * Adam asmacanın 3B sahnesi.
 *
 * Model: public/models/hangman.glb — parçaları adlarıyla ayrılmış hâlde
 * (gallows, rope, head, body, arm_l, arm_r, leg_l, leg_r).
 *
 * Mekanik: adam baştan bütün asılı duruyor. Her yanlış harfte bir uzuv
 * kopuyor ve gerçek fizikle yere düşüyor — kopan parça dinamik cisme
 * dönüşüyor, yerçekimiyle düşüyor, zemine çarpıp yuvarlanıyor.
 *
 * Kopma sırası kasten baştan uzağa doğru: kollar önce gitsin, kafa en sona
 * kalsın.
 */

const MODEL_URL = `${process.env.PUBLIC_URL}/models/hangman.glb`;

/** Kopma sırası. Uzunluğu kademe sayısını belirliyor (6). */
export const DETACH_ORDER = ["arm_l", "arm_r", "leg_l", "leg_r", "body", "head"];

const GRAVITY = -9.82;

// Model bir kez indirilip belleğe alınıyor; her bağlanışta yeniden inmesin.
let modelPromise = null;
function loadModel() {
  if (!modelPromise) {
    modelPromise = new GLTFLoader().loadAsync(MODEL_URL).then((g) => g.scene);
  }
  return modelPromise;
}

/** Bir nesnenin dünya sınırlarından kaba bir kutu çarpışma şekli üretir. */
function boxShapeFor(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  return {
    shape: new CANNON.Box(
      new CANNON.Vec3(
        Math.max(size.x, 0.02),
        Math.max(size.y, 0.02),
        Math.max(size.z, 0.02)
      )
    ),
    center: box.getCenter(new THREE.Vector3()),
  };
}

export function HangmanScene({ stage, active }) {
  const mountRef = useRef(null);
  const apiRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let raf = 0;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      // Tuvalin okunabilir kalması: ekran görüntüsü almayı mümkün kılıyor.
      // Bu boyuttaki sahnede maliyeti ihmal edilebilir.
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 0.75, 0.1, 100);
    // Biraz geride: kopan uzuvların yere savrulduğu alan da kadraja girsin.
    camera.position.set(0.7, 0.3, 4.0);
    camera.lookAt(0.1, -0.15, 0);

    // Organic paletiyle uyumlu, sıcak ışık
    scene.add(new THREE.HemisphereLight(0xfff2eb, 0x8c491a, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(2.5, 3.5, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffc6a5, 1.2);
    rim.position.set(-2.5, 1.5, -2);
    scene.add(rim);

    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY, 0) });
    world.defaultContactMaterial.friction = 0.5;
    world.defaultContactMaterial.restitution = 0.22;

    /** parça adı -> { mesh, body, home: {position, quaternion}, detached } */
    const limbs = new Map();
    let groundY = -1;

    function resize() {
      const w = mount.clientWidth || 320;
      const h = mount.clientHeight || 420;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    loadModel()
      .then((source) => {
        if (disposed) return;

        const model = source.clone(true);
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const scale = 1.9 / Math.max(size.x, size.y, size.z);

        model.position.sub(center).multiplyScalar(scale);
        model.scale.setScalar(scale);
        scene.add(model);
        // Sınır kutuları dünya matrisinden okunuyor; taşıdıktan sonra şart.
        model.updateMatrixWorld(true);

        const byName = {};
        model.traverse((o) => {
          if (o.isMesh) byName[o.name] = o;
        });

        // Zemin: darağacının tabanı
        groundY = new THREE.Box3().setFromObject(model).min.y;
        const ground = new CANNON.Body({
          mass: 0,
          shape: new CANNON.Plane(),
          position: new CANNON.Vec3(0, groundY, 0),
        });
        ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        world.addBody(ground);

        // Uzuvları sahne köküne al ki dünya dönüşümleri doğrudan yazılabilsin
        for (const name of DETACH_ORDER) {
          const mesh = byName[name];
          if (!mesh) continue;
          scene.attach(mesh);

          const { shape, center: com } = boxShapeFor(mesh);
          const body = new CANNON.Body({
            mass: 4,
            shape,
            position: new CANNON.Vec3(com.x, com.y, com.z),
            linearDamping: 0.22,
            angularDamping: 0.3,
            type: CANNON.Body.STATIC, // kopana kadar yerinde durur
          });
          world.addBody(body);

          limbs.set(name, {
            mesh,
            body,
            // kopma anında mesh'i cisme bağlarken gereken sabit fark
            offset: mesh.position.clone().sub(com),
            home: {
              position: mesh.position.clone(),
              quaternion: mesh.quaternion.clone(),
            },
            bodyHome: new CANNON.Vec3(com.x, com.y, com.z),
            detached: false,
          });
        }

        resize();
        // İlk kareyi rAF beklemeden çiz: sahne bir an boş görünmesin.
        // (Sekme gizliyken rAF hiç çalışmıyor, bu kare o durumda da düşüyor.)
        renderer.render(scene, camera);
      })
      .catch((err) => {
        console.error("hangman model yüklenemedi:", err);
      });

    /** Uzvu kopar: dinamik yap, dışa doğru bir itme ver. */
    function detach(name, index) {
      const limb = limbs.get(name);
      if (!limb || limb.detached) return;
      limb.detached = true;

      limb.body.type = CANNON.Body.DYNAMIC;
      limb.body.updateMassProperties();
      limb.body.wakeUp();

      // Sağ/sol uzuvlar kendi taraflarına savrulsun, hep aynı yöne değil.
      // İtme bilerek küçük: kadraj yaklaşık ±0.85 birim, uzuv dışarı düşerse
      // oyuncu kopmayı göremiyor.
      const side = name.endsWith("_l") ? -1 : name.endsWith("_r") ? 1 : 0;
      const spread = side || (index % 2 ? 0.5 : -0.5);
      limb.body.applyImpulse(
        new CANNON.Vec3(spread * 0.5, 0.35, 0.5),
        new CANNON.Vec3(0, 0.05, 0)
      );
      limb.body.angularVelocity.set(
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 5
      );
    }

    /** Yeni oyun: bütün uzuvlar yerine döner. */
    function reattach() {
      for (const limb of limbs.values()) {
        limb.detached = false;
        limb.body.type = CANNON.Body.STATIC;
        limb.body.velocity.setZero();
        limb.body.angularVelocity.setZero();
        limb.body.position.copy(limb.bodyHome);
        limb.body.quaternion.set(0, 0, 0, 1);
        limb.mesh.position.copy(limb.home.position);
        limb.mesh.quaternion.copy(limb.home.quaternion);
      }
    }

    /** Bir kare: fiziği ilerlet, kopan uzuvları cisimlerine eşitle, çiz. */
    function tick(dt) {
      if (limbs.size && dt > 0) {
        world.step(1 / 60, dt, 3);
        for (const limb of limbs.values()) {
          if (!limb.detached) continue;
          limb.mesh.position.copy(limb.body.position).add(limb.offset);
          limb.mesh.quaternion.copy(limb.body.quaternion);
        }
      }
      renderer.render(scene, camera);
    }

    let last = performance.now();
    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      tick(dt);
    }
    raf = requestAnimationFrame(frame);

    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    apiRef.current = {
      apply(count) {
        if (!limbs.size) return;
        if (count === 0) return reattach();
        DETACH_ORDER.slice(0, count).forEach(detach);
      },
    };

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      apiRef.current = null;
    };
  }, []);

  // Model yükleme asenkron olduğu için kademe her renderda yeniden uygulanıyor;
  // apply() zaten kopmuş uzvu tekrar koparmıyor.
  useEffect(() => {
    apiRef.current?.apply(stage);
  });

  return <div className="hangman-scene" ref={mountRef} aria-hidden={!active} />;
}
