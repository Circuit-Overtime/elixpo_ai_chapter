import { Renderer } from "https://unpkg.com/ogl@0.0.74/src/core/Renderer.js";
import { Program } from "https://unpkg.com/ogl@0.0.74/src/core/Program.js";
import { Texture } from "https://unpkg.com/ogl@0.0.74/src/core/Texture.js";
import { Triangle } from "https://unpkg.com/ogl@0.0.74/src/extras/Triangle.js";
import { Mesh } from "https://unpkg.com/ogl@0.0.74/src/core/Mesh.js";
import { Vec2 } from "https://unpkg.com/ogl@0.0.74/src/math/Vec2.js";
import { Color } from "https://unpkg.com/ogl@0.0.74/src/math/Color.js";

class LiquidPaintMesh {
  constructor(gl, {
    color,
    background,
    backgroundOpacity,
    paintTexture,
    amplitude,
    paintNoiseFrequency,
    paintNoiseAmplitude,
    flowCurveFrequency,
    flowCurveAmplitude,
    horizontal,
    viscosityIntensity,
    viscositySpeed,
    edgeFeather,
    initialProgress, // New parameter for initial uProgress
    brushInitialOpacity // New parameter for initial uBrushOpacity
  } = {}) {
    this.gl = gl;

    const geometry = new Triangle(gl);

    const vertex = /* glsl */ `
      attribute vec2 uv;
      attribute vec2 position;
      varying vec2 vUv;
      varying vec2 vImageUv; // vImageUv will now be the UVs for the image texture

      uniform vec2 uRatio; // uRatio now represents the inverse scale to achieve "cover"
      uniform float uCanvasAspect; // New uniform for canvas aspect ratio

      void main() {
          vUv = uv;
          
          // Calculate vImageUv for "cover" effect
          float imgAspect = uRatio.x; 
          float canvasAspect = uCanvasAspect;

          vec2 currentImageUv = uv;
          vec2 scale = vec2(1.0);
          vec2 offset = vec2(0.0);

          if (canvasAspect > imgAspect) { 
              scale.x = canvasAspect / imgAspect;
              offset.x = (1.0 - scale.x) * 0.5;
          } else { 
              scale.y = imgAspect / canvasAspect;
              offset.y = (1.0 - scale.y) * 0.5;
          }

          vImageUv = currentImageUv * scale + offset;


          gl_Position = vec4(position, 0, 1);
      }
    `;

    const fragment = /* glsl */ `
        #define PI 3.1415926538
        #define NUM_OCTAVES 5

        precision highp float;
        uniform float uHorizontal;
        uniform float uProgress;
        uniform float uMaxAmplitude;
        uniform float uPaintNoiseFrequency;
        uniform float uFlowCurveFrequency;
        uniform float uPaintNoiseAmplitude;
        uniform float uFlowCurveAmplitude;
        uniform float uAspect; // Canvas aspect ratio (width/height)
        
        uniform sampler2D uPaintTexture;
        uniform vec3 uColor;
        uniform sampler2D uImage;
        uniform vec3 uBackground;
        uniform float uBackgroundOpacity;
        uniform bool uInverted;

        uniform float uTime;
        uniform float uViscosityIntensity;
        uniform float uViscositySpeed;
        uniform float uEdgeFeather;
        uniform float uBrushOpacity; // Uniform for the overall brush opacity
        
        varying vec2 vUv;
        varying vec2 vImageUv; // This is the calculated UV for the image texture

        vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
        
        float snoise(vec2 v){
          const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                   -0.577350269189626, 0.024390243902439);
          vec2 i  = floor(v + dot(v, C.yy) );
          vec2 x0 = v -   i + dot(i, C.xx);
          vec2 i1;
          i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          vec4 x12 = x0.xyxy + C.xxzz;
          x12.xy -= i1;
          i = mod(i, 289.0);
          vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
          + i.x + vec3(0.0, i1.x, 1.0 ));
          vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
            dot(x12.zw,x12.zw)), 0.0);
          m = m*m ;
          m = m*m ;
          vec3 x = 2.0 * fract(p * C.www) - 1.0;
          vec3 h = abs(x) - 0.5;
          vec3 ox = floor(x + 0.5);
          vec3 a0 = x - ox;
          m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
          vec3 g;
          g.x  = a0.x  * x0.x  + h.x  * x0.y;
          g.yz = a0.yz * x12.xz + h.yz * x12.yw;
          return 130.0 * dot(m, g);
        }

        float fbm(vec2 x) {
          float v = 0.0;
          float a = 0.5;
          vec2 shift = vec2(100);
          mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.50));
          for (int i = 0; i < NUM_OCTAVES; ++i) {
            v += a * snoise(x);
            x = rot * x * 2.0 + shift;
            a *= 0.5;
          }
          return v;
        }

        void main() {
          vec2 aspectUv = vUv * vec2(uAspect, 1.);

          float flowDir = uHorizontal == 1. ? (1. - vUv.x) : vUv.y;
          float flowCurve = uMaxAmplitude * sin(flowDir * PI);

          vec2 noiseCoord = aspectUv * uPaintNoiseFrequency + uTime * uViscositySpeed;
          float fluidNoise = fbm(noiseCoord) * uPaintNoiseAmplitude;

          float paintThreshold = uProgress + flowCurve + fluidNoise;

          // 'alpha' determines how much of the paintedContent vs backgroundContent is shown
          float alpha = smoothstep(paintThreshold - uEdgeFeather * 0.5, paintThreshold + uEdgeFeather * 0.5, flowDir);
          
          if (uHorizontal == 1.) {
            alpha = 1.0 - alpha;
          }

          vec4 finalColor;
          
          // Apply distortion to vImageUv BEFORE sampling the image
          vec2 distortedImageUv = vImageUv + fbm(vUv * 5.0 + uTime * 0.1) * uViscosityIntensity * 0.1;
          vec4 image = texture2D(uImage, uInverted ? vec2(1.0 - distortedImageUv.x, distortedImageUv.y) : distortedImageUv );

          vec4 paintedContent;
          if (image.a > 0.0) {
            paintedContent = image;
            paintedContent = mix(vec4(uColor, 1.0), paintedContent, 0.8);
          } else {
            paintedContent = vec4(uColor, 1.0);
          }

          vec4 backgroundContent = vec4(uBackground, uBackgroundOpacity);

          // Mix painted content and background, applying uBrushOpacity to the painted part's alpha
          finalColor = mix(backgroundContent, paintedContent, alpha * uBrushOpacity);
          
          gl_FragColor = finalColor;
        }
    `;

    this.paintTexture = new Texture(gl, {
      wrapS: gl.REPEAT,
      wrapT: gl.REPEAT,
    });

    const defaultPaintTexture = "https://cdn.prod.website-files.com/5f2429f172d117fcee10e819/614f353f1e11a6a7afdd8b74_6059a3e2b9ae6d2bd508685c_pt-texture-2.jpg";

    const paintImg = new Image();
    paintImg.crossOrigin = "anonymous";
    paintImg.onload = () => (this.paintTexture.image = paintImg);
    paintImg.src = paintTexture || defaultPaintTexture;

    const params = {
      color: new Color(color),
    };

    this.uniforms = {
      uProgress: { value: initialProgress !== undefined ? initialProgress : 0 }, // Set initial progress based on parameter
      uMaxAmplitude: {
        value: amplitude,
      },
      uAspect: {
        value: 1, 
      },
      uCanvasAspect: {
        value: 1, 
      },
      uPaintTexture: {
        value: this.paintTexture,
      },
      uPaintNoiseFrequency: {
        value: paintNoiseFrequency,
      },
      uPaintNoiseAmplitude: {
        value: paintNoiseAmplitude,
      },
      uFlowCurveFrequency: {
        value: flowCurveFrequency,
      },
      uFlowCurveAmplitude: {
        value: flowCurveAmplitude,
      },
      uImage: {
        value: new Texture(this.gl),
      },
      uRatio: {
        value: new Vec2(1, 1), 
      },
      uColor: {
        value: params.color,
      },
      uBackground: {
        value: new Color(background),
      },
      uBackgroundOpacity: {
        value: backgroundOpacity,
      },
      uInverted: {
        value: false,
      },
      uHorizontal: {
        value: horizontal ? 1 : 0,
      },
      uTime: { value: 0 },
      uViscosityIntensity: { value: viscosityIntensity },
      uViscositySpeed: { value: viscositySpeed },
      uEdgeFeather: { value: edgeFeather },
      uBrushOpacity: { value: brushInitialOpacity !== undefined ? brushInitialOpacity : 0 }, // Set initial brush opacity based on parameter
    };

    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: this.uniforms,
      transparent: true, 
      premultipliedAlpha: true,
    });

    this.mesh = new Mesh(gl, { geometry, program });
  }

  setBackground(color, opacity) {
    this.uniforms.uBackground.value = new Color(color);
    this.uniforms.uBackgroundOpacity.value = opacity;
  }

  setColor(color) {
    this.uniforms.uColor.value = new Color(color);
  }

  setInverted(value) {
    this.uniforms.uInverted.value = value;
  }

  setImage(src) {
    const texture = new Texture(this.gl, {
      wrapS: this.gl.CLAMP_TO_EDGE, 
      wrapT: this.gl.CLAMP_TO_EDGE, 
    });

    const img = new Image();
    img.crossOrigin = "anonymous";
    const promise = new Promise((resolve, reject) => {
      img.onload = () => {
        texture.image = img;
        this.uniforms.uRatio.value = new Vec2(img.naturalWidth / img.naturalHeight, 1.0); 

        this.uniforms.uImage.value = texture;
        resolve();
      };
      img.onerror = reject;
    });

    img.src = src;
    return promise;
  }
}

// Main effect class
export default class LiquidPaintEffect {
  constructor(
    canvas,
    {
      color = "#1a73e8",
      background = "#ffffff",
      backgroundOpacity = 1.0,
      ease = "power2.inOut",
      duration = 2,
      paintTexture = "",
      amplitude = 0.25,
      paintNoiseFrequency = 7.0,
      paintNoiseAmplitude = 0.1,
      flowCurveFrequency = 1,
      flowCurveAmplitude = 1,
      horizontal = false,
      viscosityIntensity = 0.15,
      viscositySpeed = 0.55,
      edgeFeather = 0.0001,
      initialProgress = 0, // Default to 0 for initial sweep-in
      brushInitialOpacity = 0 // Default to 0 for initial fade-in
    } = {}
  ) {
    this.canvas = canvas;

    this.initGL();

    this.onCanvasResizeHandler = this.onCanvasResize.bind(this);
    this.resizeObserver = new ResizeObserver(this.onCanvasResizeHandler);
    this.resizeObserver.observe(this.canvas);

    this.curtain = new LiquidPaintMesh(this.gl, {
      color,
      background,
      backgroundOpacity,
      paintTexture,
      amplitude,
      paintNoiseFrequency,
      paintNoiseAmplitude,
      flowCurveFrequency,
      flowCurveAmplitude,
      horizontal,
      viscosityIntensity,
      viscositySpeed,
      edgeFeather,
      initialProgress: initialProgress, 
      brushInitialOpacity: brushInitialOpacity 
    });
    
    this.horizontal = horizontal; 

    this.onFrameHandler = this.onFrame.bind(this);
    if (typeof gsap === 'undefined') {
        console.error("GSAP is not loaded. Please include GSAP in your project.");
        this.rafId = requestAnimationFrame(this.onFrameHandler);
    } else {
        gsap.ticker.add(this.onFrameHandler);
    }

    this.isLooping = false;
    this.ease = ease;
    this.duration = duration;
    this.time = 0;
  }

  destroy() {
    this.resizeObserver.unobserve(this.canvas);
    if (typeof gsap !== 'undefined') {
        gsap.ticker.remove(this.onFrameHandler);
    } else if (this.rafId) {
        cancelAnimationFrame(this.rafId);
    }
    this.curtain.mesh.program.remove();
    this.curtain.mesh.geometry.remove();
    this.curtain.paintTexture.remove();
    if (this.curtain.uniforms.uImage.value instanceof Texture) {
        this.curtain.uniforms.uImage.value.remove();
    }
  }

  onCanvasResize(entries) {
    const entry = entries[0];
    this.canvasSize = {
      width: entry.contentRect.width,
      height: entry.contentRect.height,
    };
    this.resizeGL();
  }

  initGL() {
    this.renderer = new Renderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      dpr: Math.min(window.devicePixelRatio, 2),
    });
    this.gl = this.renderer.gl;
    this.gl.clearColor(0, 0, 0, 0); 
  }

  // No separate fadeBrushIn method needed, as it's handled by direct GSAP tween in brush.html
  // on curtain.uniforms.uBrushOpacity

  in() {
    if (this.tl) this.tl.kill();
    // For "reveal", uProgress goes from 1 (covered) to 0 (revealed) if horizontal.
    // So, target should be 0.
    const targetValue = this.horizontal ? 0 : 1; 
    this.tl = gsap.to(this.curtain.uniforms.uProgress, {
      value: targetValue,
      duration: this.duration,
      ease: this.ease,
      onComplete: () => {
        document.body.dispatchEvent(new Event("liquid-paint-complete"));
      },
    });
  }

  out() {
    if (this.tl) this.tl.kill();
    // For "cover", uProgress goes from 0 (revealed) to 1 (covered) if horizontal.
    // So, target should be 1.
    const targetValue = this.horizontal ? 1 : 0;
    this.tl = gsap.to(this.curtain.uniforms.uProgress, {
      value: targetValue,
      duration: this.duration,
      ease: this.ease,
      onComplete: () => {
        document.body.dispatchEvent(new Event("liquid-paint-complete"));
      },
    });
  }

  resizeGL() {
    this.renderer.setSize(this.canvasSize.width, this.canvasSize.height);
    const canvasAspect = this.canvasSize.width / this.canvasSize.height;
    this.curtain.uniforms.uAspect.value = canvasAspect;
    this.curtain.uniforms.uCanvasAspect.value = canvasAspect;
  }

  onFrame() {
    this.time += 0.01;
    this.curtain.uniforms.uTime.value = this.time;
    this.renderer.render({ scene: this.curtain.mesh });

    if (this.isLooping) {
      this.curtain.uniforms.uProgress.value = (Math.sin(this.time * 0.5) + 1) * 0.5;
    }

    if (typeof gsap === 'undefined' && !this.rafId) {
        this.rafId = requestAnimationFrame(this.onFrameHandler);
    }
  }

  setBackground(color, opacity) {
    this.curtain.setBackground(color, opacity);
  }

  setColor(color) {
    this.curtain.setColor(color);
  }

  setInverted(value) {
    this.curtain.setInverted(value);
  }

  setImage(src) {
    return this.curtain.setImage(src);
  }
}