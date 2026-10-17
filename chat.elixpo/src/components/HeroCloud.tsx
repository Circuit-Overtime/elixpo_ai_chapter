'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/* ───────────────────────────────────────────────────────
 *  GLSL — Volumetric FBM Cloud Shader
 *  Procedural noise → domain warp → density → dark indigo clouds
 * ─────────────────────────────────────────────────────── */

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec2 uResolution;
  varying vec2 vUv;

  /* ── Hash: high-quality pseudo-random vec2 → float ── */
  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  /* ── 2D Value Noise with bilinear interpolation ── */
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  /* ── FBM: 6 octaves ── */
  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    for (int i = 0; i < 6; i++) {
      value += amplitude * noise(p * frequency);
      frequency *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / uResolution.y;
    uv.x *= aspect;

    // Time factor for fluid motion
    float t = uTime * 0.12;

    // ── Drift: panning motion ──
    vec2 drift = vec2(t * 0.1, t * 0.15);

    // ── Slow rotation ──
    float angle = sin(t * 0.2) * 0.05;
    float cosA = cos(angle);
    float sinA = sin(angle);
    vec2 center = vec2(aspect * 0.5, 0.5);
    vec2 rotUV = uv - center;
    rotUV = vec2(rotUV.x * cosA - rotUV.y * sinA,
                 rotUV.x * sinA + rotUV.y * cosA);
    rotUV += center;

    // Scale UV for massive Codex-like clouds
    vec2 baseUV = rotUV * 1.2 + drift;

    // ── Domain warp pass 1 (fluid rolling motion) ──
    float warp1 = fbm(baseUV + vec2(t * 0.25, t * 0.15));
    vec2 warpedUV = baseUV + vec2(warp1) * 0.8;

    // ── Domain warp pass 2 (internal churning) ──
    float warp2 = fbm(warpedUV + vec2(-t * 0.2, t * 0.3));
    warpedUV += vec2(warp2) * 0.5;

    // ── Final density field ──
    float density = fbm(warpedUV + vec2(t * 0.15, -t * 0.1));

    // Increase contrast heavily to create distinct volumetric smoke clouds
    float smoke = smoothstep(0.2, 0.65, density);

    // ── Color palette: Enhanced visibility while staying dark/indigo ──
    vec3 baseBackground = vec3(0.06, 0.05, 0.16);
    vec3 cloudMidTone   = vec3(0.18, 0.14, 0.38);
    vec3 cloudGlow      = vec3(0.35, 0.28, 0.55);

    // Volumetric layering
    vec3 color = mix(baseBackground, cloudMidTone, smoke);
    color = mix(color, cloudGlow, smoothstep(0.5, 1.0, smoke));

    // ── Alpha: Thick opaque clouds, transparent gaps ──
    float alpha = smoothstep(0.0, 0.7, smoke) * 0.95;

    // ── Radial vignette ──
    vec2 vigUV = (vUv - 0.5) * 2.0;
    float vignette = 1.0 - dot(vigUV, vigUV) * 0.35;
    vignette = clamp(vignette, 0.0, 1.0);
    alpha *= vignette;

    gl_FragColor = vec4(color, alpha);
  }
`;

/* ───────────────────────────────────────────────────────
 *  React component: renders a Three.js canvas into the
 *  hero section, absolutely positioned behind content.
 * ─────────────────────────────────────────────────────── */

export default function HeroCloud() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    /* ── Pixel ratio: cap at 1.5, drop to 1.0 on mobile ── */
    const isMobile = window.innerWidth < 768;
    const pixelRatio = Math.min(window.devicePixelRatio, isMobile ? 1.0 : 1.5);

    /* ── Renderer: transparent background ── */
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.domElement.id = 'hero-cloud-canvas';

    container.appendChild(renderer.domElement);

    /* ── Scene: fullscreen quad with shader material ── */
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const uniforms = {
      uTime: { value: 0 },
      uResolution: {
        value: new THREE.Vector2(container.clientWidth, container.clientHeight),
      },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });

    // Fullscreen triangle (more efficient than a quad — single draw call, no vertex shared)
    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    /* ── Animation loop ── */
    let startTime = performance.now();
    let animFrameId: number;
    let paused = false;
    let pausedTime = 0;

    function animate() {
      animFrameId = requestAnimationFrame(animate);
      const elapsed = (performance.now() - startTime) / 1000; // seconds
      uniforms.uTime.value = elapsed;
      renderer.render(scene, camera);
    }
    animate();

    /* ── Resize handler ── */
    function onResize() {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      uniforms.uResolution.value.set(w, h);

      // Re-evaluate mobile pixel ratio
      const mobile = window.innerWidth < 768;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.0 : 1.5));
    }
    window.addEventListener('resize', onResize);

    /* ── Pause when tab hidden ── */
    function onVisibility() {
      if (document.hidden) {
        paused = true;
        pausedTime = performance.now();
        cancelAnimationFrame(animFrameId);
      } else {
        if (paused) {
          // Adjust startTime to account for paused duration
          startTime += performance.now() - pausedTime;
          paused = false;
        }
        animate();
      }
    }
    document.addEventListener('visibilitychange', onVisibility);

    /* ── Cleanup ── */
    cleanupRef.current = () => {
      cancelAnimationFrame(animFrameId);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.dispose();
      material.dispose();
      geometry.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };

    return () => {
      cleanupRef.current?.();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 1,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    />
  );
}
