// 环境：影棚灯光、HDRI 级环境反射（RoomEnvironment 经 PMREM）、地面阴影、空气尘埃

import * as THREE from 'three';
import { Z } from './watch/dimensions.js';

function dustSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,246,230,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return c;
}

function radialGlow() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(256, 256, 0, 256, 256, 256);
  g.addColorStop(0, 'rgba(255,236,206,0.5)');
  g.addColorStop(0.35, 'rgba(180,196,224,0.16)');
  g.addColorStop(0.75, 'rgba(80,96,128,0.04)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 512);
  return c;
}

/** 影棚环境贴图用的 HDR 场景：一块正面柔光箱 + 侧光 + 顶光 + 背光。
 *  比 RoomEnvironment 更可控——平抛光的盘面与指针只会反射正面的柔光箱。 */
function studioEnvScene() {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x0a0c10);
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(240, 170, 240),
    new THREE.MeshBasicMaterial({ color: 0x0b0e13, side: THREE.BackSide })
  );
  s.add(room);
  const panel = (color, intensity, w, h, pos) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(color) }, uI: { value: intensity } },
        vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
        fragmentShader: 'uniform vec3 uColor; uniform float uI; void main(){ gl_FragColor = vec4( uColor * uI, 1.0 ); }',
        side: THREE.DoubleSide,
      })
    );
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    s.add(m);
    return m;
  };
  panel(0xfff4e6, 1.95, 92, 72, [18, 26, 90]); // 正面主柔光箱（略偏轴，让盘面出现斜向渐变）
  panel(0xcfe0ff, 0.85, 62, 95, [-82, 16, 28]); // 左侧冷光
  panel(0xffdcb0, 0.95, 62, 95, [86, 6, 20]); // 右侧暖光
  panel(0xffffff, 1.5, 130, 26, [0, 70, 4]); // 顶部条光
  panel(0xffe0bc, 0.75, 95, 62, [0, 22, -88]); // 背光勾边
  panel(0x2c3446, 0.28, 130, 130, [0, -62, 0]); // 地面反弹
  return s;
}

export function createEnvironment(renderer, scene, quality) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = studioEnvScene();
  const envTex = pmrem.fromScene(envScene, 0.03).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.6;
  pmrem.dispose();

  const rig = new THREE.Group();
  rig.name = 'lighting';
  scene.add(rig);

  // 主光（暖白，投影）
  const key = new THREE.DirectionalLight(0xfff3e2, 1.2);
  key.position.set(34, 44, 30);
  key.castShadow = true;
  key.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
  key.shadow.camera.left = -36;
  key.shadow.camera.right = 36;
  key.shadow.camera.top = 36;
  key.shadow.camera.bottom = -36;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 190;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.035;
  key.shadow.radius = 5;
  rig.add(key);

  // 侧补光（冷，勾金属边缘）
  const fill = new THREE.DirectionalLight(0x9dc2ff, 1.1);
  fill.position.set(-40, -8, 26);
  rig.add(fill);

  // 正面柔光：让盘面与机芯内部不落进死黑
  const front = new THREE.DirectionalLight(0xffe9d2, 0.85);
  front.position.set(-6, 10, 60);
  rig.add(front);

  // 轮廓光（暖，来自背面）
  const rim = new THREE.DirectionalLight(0xffd8a8, 0.85);
  rim.position.set(-18, 20, -46);
  rig.add(rim);

  // 顶部柔光
  const top = new THREE.DirectionalLight(0xffffff, 0.5);
  top.position.set(4, 60, 6);
  rig.add(top);

  // 地面 + 阴影
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.42 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = Z.ground;
  ground.receiveShadow = true;
  scene.add(ground);

  const glowTex = new THREE.CanvasTexture(radialGlow());
  glowTex.colorSpace = THREE.SRGBColorSpace;
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 150),
    new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 })
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = Z.ground + 0.05;
  scene.add(pool);

  // 空气尘埃
  const count = quality.dust;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 130;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 90;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 130;
    seed[i] = Math.random() * 100;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const dustMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: 2.6 },
      uOpacity: { value: 0.5 },
      uTex: { value: new THREE.CanvasTexture(dustSprite()) },
      uPixelRatio: { value: 1 },
    },
    vertexShader: `
      attribute float aSeed;
      uniform float uTime;
      uniform float uSize;
      uniform float uPixelRatio;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        float s = aSeed;
        p.x += sin( uTime * 0.12 + s ) * 1.6;
        p.y += cos( uTime * 0.09 + s * 1.7 ) * 1.9 + sin( uTime * 0.05 + s ) * 0.8;
        p.z += sin( uTime * 0.07 + s * 2.3 ) * 1.4;
        vec4 mv = modelViewMatrix * vec4( p, 1.0 );
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uPixelRatio * ( 60.0 / max( 1.0, -mv.z ) );
        vAlpha = 0.35 + 0.65 * fract( s * 0.37 );
      }
    `,
    fragmentShader: `
      uniform sampler2D uTex;
      uniform float uOpacity;
      varying float vAlpha;
      void main() {
        vec4 t = texture2D( uTex, gl_PointCoord );
        gl_FragColor = vec4( t.rgb, t.a * uOpacity * vAlpha );
        if ( gl_FragColor.a < 0.01 ) discard;
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const dust = new THREE.Points(geo, dustMat);
  scene.add(dust);

  return {
    rig,
    key,
    fill,
    front,
    rim,
    top,
    ground,
    pool,
    dust,
    dustMat,
    setPixelRatio: (r) => {
      dustMat.uniforms.uPixelRatio.value = r;
    },
    update: (t) => {
      dustMat.uniforms.uTime.value = t;
    },
    // 各幕的灯光强度（0~1 的进片曲线）
    setIntensity: (k) => {
      key.intensity = 0.85 * k;
      fill.intensity = 0.4 * (0.35 + 0.65 * k);
      front.intensity = 0.5 * (0.3 + 0.7 * k);
      rim.intensity = 0.6 * (0.25 + 0.75 * k);
      top.intensity = 0.18 * k;
      pool.material.opacity = 0.2 * k;
      ground.material.opacity = 0.42 * k;
    },
  };
}
