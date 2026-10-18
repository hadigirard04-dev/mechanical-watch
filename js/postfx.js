// 后期：泛光（高光溢出）+ 胶片质感（暗角 / 颗粒 / 轻微色散 / 分离调色）+ 质量分级

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const QUALITY = {
  high: { key: 'high', dprCap: 2, shadowMap: 2048, dust: 900, bloom: true, transmission: true, bloomRes: 1 },
  medium: { key: 'medium', dprCap: 1.5, shadowMap: 1024, dust: 520, bloom: true, transmission: true, bloomRes: 0.5 },
  low: { key: 'low', dprCap: 1, shadowMap: 512, dust: 220, bloom: false, transmission: false, bloomRes: 0.5 },
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.05 },
    uVignette: { value: 0.62 },
    uAberration: { value: 0.0022 },
    uFade: { value: 0 },
    uContrast: { value: 1.06 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGrain;
    uniform float uVignette;
    uniform float uAberration;
    uniform float uFade;
    uniform float uContrast;
    uniform vec2 uResolution;
    varying vec2 vUv;

    float hash( vec2 p ) {
      return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
    }

    void main() {
      vec2 dir = vUv - 0.5;
      float d = length( dir );
      // 轻微径向色散
      vec2 off = dir * uAberration * d;
      vec3 col;
      col.r = texture2D( tDiffuse, vUv - off ).r;
      col.g = texture2D( tDiffuse, vUv ).g;
      col.b = texture2D( tDiffuse, vUv + off ).b;

      float luma = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );

      // 分离调色：暗部偏冷、亮部偏暖
      vec3 cool = col * vec3( 0.95, 0.98, 1.07 );
      vec3 warm = col * vec3( 1.06, 1.0, 0.93 );
      col = mix( cool, warm, smoothstep( 0.28, 0.86, luma ) );

      // 对比与暗角
      col = ( col - 0.5 ) * uContrast + 0.5;
      float vig = smoothstep( 1.05, 0.28, d * 1.42 );
      col *= mix( 1.0, vig, uVignette );

      // 胶片颗粒（暗部更明显）
      float n = hash( vUv * uResolution + vec2( uTime * 37.0, uTime * 19.0 ) );
      col += ( n - 0.5 ) * uGrain * ( 1.25 - luma );

      col *= ( 1.0 - uFade );
      gl_FragColor = vec4( max( col, 0.0 ), 1.0 );
    }
  `,
};

export function createPostFX(renderer, scene, camera, quality) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(size.x, size.y);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  let bloom = null;
  if (quality.bloom) {
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x * quality.bloomRes, size.y * quality.bloomRes), 0.26, 0.6, 0.94);
    composer.addPass(bloom);
  }

  const output = new OutputPass();
  composer.addPass(output);

  const grade = new ShaderPass(GradeShader);
  grade.renderToScreen = true;
  composer.addPass(grade);

  return {
    composer,
    renderPass,
    bloom,
    grade,
    setSize: (w, h) => {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      bloom?.setSize(w * quality.bloomRes, h * quality.bloomRes);
      grade.uniforms.uResolution.value.set(w, h);
    },
    update: (t) => {
      grade.uniforms.uTime.value = t;
    },
    setBloom: (strength, threshold) => {
      if (!bloom) return;
      bloom.strength = strength;
      if (threshold !== undefined) bloom.threshold = threshold;
    },
  };
}
