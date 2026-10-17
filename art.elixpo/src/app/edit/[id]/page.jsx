'use client';

import { useState, useRef, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { useModels } from '../../lib/useModels';
import { STYLE_PRESETS } from '../../lib/blueprints';
import { generateVideo } from '../../lib/videoGen';
import { generateVideoPrompt } from '../../lib/autoPrompt';
import styles from './Editor.module.css';

const API_BASE = '/api';

const TOOLS = [
  { id: 'select', label: 'Select', hint: 'Click to select, drag to pan. Drag handles to resize. Press Delete to remove.' },
  { id: 'sketch', label: 'Sketch', hint: 'Draw on or around the image — paint areas for AI to regenerate based on your prompt' },
  { id: 'eraser', label: 'Eraser', hint: 'Erase parts of the sketch mask' },
];

const CANVAS_MODES = [];

const TOOL_ICONS = {
  select: <><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /><path d="M13 13l6 6" /></>,
  sketch: <><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></>,
  eraser: <><path d="M20 20H7L3 16l9-9 8 8-4 4z" /><path d="M6.5 13.5l5-5" /></>,
};

const EDIT_PRESETS = [
  { id: 'remove-bg', label: 'Remove Background', icon: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 9h6v6H9z" /></>, prompt: null, comingSoon: true },
  { id: 'outpaint', label: 'Extend Image', icon: <><rect x="5" y="5" width="14" height="14" rx="1" strokeDasharray="3 2" /><path d="M2 12h3M19 12h3M12 2v3M12 19v3" /></>, prompt: 'Extend the image beyond its current borders, seamlessly continuing the scene' },
  { id: 'fix-pose', label: 'Fix Character Pose', icon: <><circle cx="12" cy="4" r="2" /><path d="M12 6v5" /><path d="M9 11l-3 5" /><path d="M15 11l3 5" /></>, prompt: null, isPosePicker: true },
  { id: 'upscale', label: 'Enhance / Upscale', icon: <><path d="M15 3h6v6" /><path d="M14 10l7-7" /><path d="M9 21H3v-6" /><path d="M10 14l-7 7" /></>, prompt: null, comingSoon: true },
  { id: 'relight', label: 'Relight Scene', icon: <><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2" /></>, prompt: null, isRelight: true },
  { id: 'style-transfer', label: 'Style Transfer', icon: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /></>, prompt: null, isStyleTransfer: true },
];

const RELIGHT_OPTIONS = [
  { id: 'golden-hour', label: 'Golden Hour', prompt: 'Relight this scene with warm golden-hour sunlight, long soft shadows, amber tones' },
  { id: 'blue-hour', label: 'Blue Hour', prompt: 'Relight this scene with cool blue-hour twilight, soft diffused light, blue-purple tones' },
  { id: 'neon', label: 'Neon Glow', prompt: 'Relight this scene with vibrant neon lighting, pink and cyan glow, cyberpunk atmosphere' },
  { id: 'studio', label: 'Studio Light', prompt: 'Relight with professional studio lighting, soft key light, rim light, clean shadows' },
  { id: 'dramatic', label: 'Dramatic', prompt: 'Relight with dramatic chiaroscuro lighting, strong contrast, deep shadows, single light source' },
  { id: 'overcast', label: 'Overcast', prompt: 'Relight with soft overcast daylight, even diffused lighting, no harsh shadows' },
  { id: 'candlelight', label: 'Candlelight', prompt: 'Relight with warm flickering candlelight, intimate mood, orange-amber glow' },
  { id: 'moonlight', label: 'Moonlight', prompt: 'Relight with cool silvery moonlight, night scene, subtle blue highlights' },
];

const POSE_LIMBS = [
  ['nose', 'leftShoulder', '#ff6b6b'],
  ['nose', 'rightShoulder', '#ff6b6b'],
  ['leftShoulder', 'leftElbow', '#74c0fc'],
  ['leftElbow', 'leftWrist', '#74c0fc'],
  ['rightShoulder', 'rightElbow', '#ffa94d'],
  ['rightElbow', 'rightWrist', '#ffa94d'],
  ['leftShoulder', 'rightShoulder', '#a9e34b'],
  ['leftHip', 'rightHip', '#a9e34b'],
  ['leftShoulder', 'leftHip', '#a9e34b'],
  ['rightShoulder', 'rightHip', '#a9e34b'],
  ['leftHip', 'leftKnee', '#ffd43b'],
  ['leftKnee', 'leftAnkle', '#ffd43b'],
  ['rightHip', 'rightKnee', '#da77f2'],
  ['rightKnee', 'rightAnkle', '#da77f2'],
];

const DEFAULT_SKELETON = {
  nose:           { x: 0.50, y: 0.08 },
  leftShoulder:   { x: 0.42, y: 0.22 },
  rightShoulder:  { x: 0.58, y: 0.22 },
  leftElbow:      { x: 0.38, y: 0.35 },
  rightElbow:     { x: 0.62, y: 0.35 },
  leftWrist:      { x: 0.36, y: 0.48 },
  rightWrist:     { x: 0.64, y: 0.48 },
  leftHip:        { x: 0.44, y: 0.52 },
  rightHip:       { x: 0.56, y: 0.52 },
  leftKnee:       { x: 0.43, y: 0.70 },
  rightKnee:      { x: 0.57, y: 0.70 },
  leftAnkle:      { x: 0.43, y: 0.88 },
  rightAnkle:     { x: 0.57, y: 0.88 },
};

const JOINT_COLORS = {
  nose: '#ff6b6b', leftShoulder: '#74c0fc', rightShoulder: '#ffa94d',
  leftElbow: '#74c0fc', rightElbow: '#ffa94d', leftWrist: '#74c0fc', rightWrist: '#ffa94d',
  leftHip: '#a9e34b', rightHip: '#a9e34b', leftKnee: '#ffd43b', rightKnee: '#da77f2',
  leftAnkle: '#ffd43b', rightAnkle: '#da77f2',
};

function buildPosePrompt(joints) {
  const parts = [];
  // Arm height
  if (joints.leftWrist.y < joints.leftShoulder.y - 0.05) parts.push('left arm raised above head');
  else if (joints.leftWrist.y < joints.leftElbow.y - 0.03) parts.push('left arm raised');
  else parts.push('left arm at side');

  if (joints.rightWrist.y < joints.rightShoulder.y - 0.05) parts.push('right arm raised above head');
  else if (joints.rightWrist.y < joints.rightElbow.y - 0.03) parts.push('right arm raised');
  else parts.push('right arm at side');

  // Arm extension
  const shoulderSpan = Math.abs(joints.rightShoulder.x - joints.leftShoulder.x);
  if (Math.abs(joints.leftWrist.x - joints.leftShoulder.x) > shoulderSpan * 0.8) parts.push('left arm extended outward');
  if (Math.abs(joints.rightWrist.x - joints.rightShoulder.x) > shoulderSpan * 0.8) parts.push('right arm extended outward');

  // Leg bend
  if (Math.abs(joints.leftKnee.x - joints.leftHip.x) > 0.08) parts.push('left leg bent');
  if (Math.abs(joints.rightKnee.x - joints.rightHip.x) > 0.08) parts.push('right leg bent');

  // Stance width
  const hipSpan = Math.abs(joints.rightHip.x - joints.leftHip.x);
  const ankleSpan = Math.abs(joints.rightAnkle.x - joints.leftAnkle.x);
  if (ankleSpan > hipSpan * 1.5) parts.push('wide stance legs apart');
  else if (ankleSpan < hipSpan * 0.5) parts.push('legs together');

  // Body lean
  const torsoCenter = (joints.leftShoulder.x + joints.rightShoulder.x) / 2;
  if (joints.nose.x < torsoCenter - 0.06) parts.push('leaning left');
  else if (joints.nose.x > torsoCenter + 0.06) parts.push('leaning right');

  return `character with ${parts.join(', ')}, full body visible`;
}

export default function EditorPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const { editModels, videoModels } = useModels();

  // Image state
  const [imageSrc, setImageSrc] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [originalPrompt, setOriginalPrompt] = useState('');
  const [model, setModel] = useState('gptimage');
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(576);

  // Editor state
  const [activeTool, setActiveTool] = useState('select');
  const [canvasMode, setCanvasMode] = useState('img2img');
  const [brushSize, setBrushSize] = useState(8);
  const [zoom, setZoom] = useState(100);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [modelOpen, setModelOpen] = useState(false);
  const [selected, setSelected] = useState(false);

  // Video state
  const [previewTab, setPreviewTab] = useState('image'); // 'image' | 'video'
  const [videoSrc, setVideoSrc] = useState(null);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [videoModel, setVideoModel] = useState('ltx-2');
  const [stylePicker, setStylePicker] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState(null);
  const [relightPicker, setRelightPicker] = useState(false);
  const [posePicker, setPosePicker] = useState(false);
  const [checkingCharacter, setCheckingCharacter] = useState(false);
  const [skeletons, setSkeletons] = useState([{ ...DEFAULT_SKELETON }]);
  const [poseNote, setPoseNote] = useState('');
  const draggingJoint = useRef(null); // { charIdx, jointName }
  const abortRef = useRef(null);

  // Pan state
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOffsetStart = useRef({ x: 0, y: 0 });

  // Resize state
  const [imageSize, setImageSize] = useState({ w: 0, h: 0 });
  const isResizing = useRef(false);
  const resizeCorner = useRef(null);
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const [helpTooltip, setHelpTooltip] = useState(null);

  // Undo history (stores mask canvas snapshots + image states)
  const [undoStack, setUndoStack] = useState([]);

  // Canvas refs
  const maskCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const isDrawing = useRef(false);
  const fileInputRef = useRef(null);
  const lastPoint = useRef(null);

  // Load image from session
  useEffect(() => {
    const raw = sessionStorage.getItem(`gen_${id}`);
    if (raw) {
      try {
        const data = JSON.parse(raw);
        setImageSrc(data.resultSrc || data.imageUrl);
        setOriginalPrompt(data.prompt || '');
        setModel(data.model || 'gptimage');
        setWidth(data.width || 1024);
        setHeight(data.height || 576);
        if (data.videoData) setVideoSrc(data.videoData);
      } catch {}
    }
  }, [id]);

  // ─── Undo helpers ───
  const saveUndoSnapshot = useCallback(() => {
    const mask = maskCanvasRef.current;
    const snapshot = { imageSrc, maskData: null };
    if (mask) {
      snapshot.maskData = mask.toDataURL();
    }
    setUndoStack(prev => [...prev.slice(-20), snapshot]); // keep last 20
  }, [imageSrc]);

  const handleUndo = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      // Restore image
      if (last.imageSrc !== undefined) setImageSrc(last.imageSrc);
      // Restore mask
      if (last.maskData && maskCanvasRef.current) {
        const img = new Image();
        img.onload = () => {
          const ctx = maskCanvasRef.current.getContext('2d');
          ctx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
          ctx.drawImage(img, 0, 0);
        };
        img.src = last.maskData;
      } else if (maskCanvasRef.current) {
        const ctx = maskCanvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
      }
      return prev.slice(0, -1);
    });
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Undo: Ctrl+Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
        return;
      }
      // Delete image when selected
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected && imageSrc) {
        e.preventDefault();
        saveUndoSnapshot();
        setImageSrc(null);
        setSelected(false);
        const raw = sessionStorage.getItem(`gen_${id}`);
        if (raw) {
          const session = JSON.parse(raw);
          delete session.resultSrc;
          sessionStorage.setItem(`gen_${id}`, JSON.stringify(session));
        }
      }
      // Escape
      if (e.key === 'Escape') {
        setSelected(false);
        setModelOpen(false);
        setHelpTooltip(null);
        setStylePicker(false);
        setRelightPicker(false);
        setPosePicker(false);
      }
      // Tool shortcuts
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'v' || e.key === 'V') setActiveTool('select');
      if (e.key === 'b' || e.key === 'B') setActiveTool('sketch');
      if (e.key === 'e' || e.key === 'E') setActiveTool('eraser');
    };

    // Ctrl+V paste image
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          const reader = new FileReader();
          reader.onload = () => {
            saveUndoSnapshot();
            setImageSrc(reader.result);
            setImageSize({ w: 0, h: 0 });
            setSelected(false);
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('paste', handlePaste);
    };
  }, [selected, imageSrc, id, handleUndo, saveUndoSnapshot]);

  // Scroll to zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom((z) => Math.max(10, Math.min(400, z + (e.deltaY < 0 ? 10 : -10))));
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  // Initialize mask canvas when image loads
  const initMaskCanvas = useCallback(() => {
    const img = imgRef.current;
    const mask = maskCanvasRef.current;
    if (!img || !mask) return;
    mask.width = img.naturalWidth || img.width;
    mask.height = img.naturalHeight || img.height;
    const ctx = mask.getContext('2d');
    ctx.clearRect(0, 0, mask.width, mask.height);
    // Set initial display size
    if (imageSize.w === 0) {
      setImageSize({ w: img.clientWidth, h: img.clientHeight });
    }
  }, [imageSize.w]);

  // ─── Resize handlers ───
  const startResize = (corner, e) => {
    e.stopPropagation();
    isResizing.current = true;
    resizeCorner.current = corner;
    resizeStart.current = { x: e.clientX, y: e.clientY, w: imageSize.w, h: imageSize.h };
    window.addEventListener('pointermove', onResizeMove);
    window.addEventListener('pointerup', onResizeEnd);
  };

  const onResizeMove = (e) => {
    if (!isResizing.current) return;
    const dx = e.clientX - resizeStart.current.x;
    const dy = e.clientY - resizeStart.current.y;
    const aspect = resizeStart.current.w / resizeStart.current.h;
    let nw = resizeStart.current.w;
    let nh = resizeStart.current.h;
    const c = resizeCorner.current;
    if (c === 'BR' || c === 'TR') nw = Math.max(100, resizeStart.current.w + dx);
    if (c === 'BL' || c === 'TL') nw = Math.max(100, resizeStart.current.w - dx);
    nh = nw / aspect;
    setImageSize({ w: Math.round(nw), h: Math.round(nh) });
  };

  const onResizeEnd = () => {
    isResizing.current = false;
    window.removeEventListener('pointermove', onResizeMove);
    window.removeEventListener('pointerup', onResizeEnd);
  };

  // ─── Pan / draw / select handlers ───
  const handleCanvasPointerDown = (e) => {
    if (isResizing.current || posePicker) return;
    if (activeTool === 'select') {
      setSelected(true);
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      panOffsetStart.current = { ...panOffset };
      e.currentTarget.setPointerCapture(e.pointerId);
    } else if (activeTool === 'sketch' || activeTool === 'eraser') {
      saveUndoSnapshot();
      isDrawing.current = true;
      lastPoint.current = null;
      drawAt(e);
    }
  };

  const handleCanvasPointerMove = (e) => {
    if (isResizing.current) return;
    if (isPanning.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPanOffset({
        x: panOffsetStart.current.x + dx,
        y: panOffsetStart.current.y + dy,
      });
    } else if (isDrawing.current) {
      drawAt(e);
    }
  };

  const handleCanvasPointerUp = () => {
    isPanning.current = false;
    isDrawing.current = false;
    lastPoint.current = null;
  };

  // ─── Drawing (smooth strokes with line interpolation) ───
  const drawAt = (e) => {
    const mask = maskCanvasRef.current;
    if (!mask) return;
    const rect = mask.getBoundingClientRect();
    const scaleX = mask.width / rect.width;
    const scaleY = mask.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const r = brushSize * scaleX;
    const ctx = mask.getContext('2d');
    ctx.globalCompositeOperation = activeTool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = activeTool === 'eraser' ? 'rgba(255,255,255,1)' : 'rgba(86, 145, 243, 0.5)';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = r * 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (lastPoint.current) {
      // Smooth line from last point to current
      ctx.beginPath();
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      // First dot
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    lastPoint.current = { x, y };
  };

  const clearMask = () => {
    const mask = maskCanvasRef.current;
    if (!mask) return;
    const ctx = mask.getContext('2d');
    ctx.clearRect(0, 0, mask.width, mask.height);
  };

  // Convert image to base64 if it's a blob URL or needs conversion
  const getImageAsBase64 = useCallback(async (src) => {
    if (!src) return null;
    // Already base64
    if (src.startsWith('data:')) return src;
    // HTTP URL or blob URL — convert via canvas
    if (src.startsWith('http') || src.startsWith('blob:')) {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          resolve(c.toDataURL('image/png'));
        };
        img.onerror = () => resolve(src);
        img.src = src;
      });
    }
    return src;
  }, []);

  // ─── Run edit ───
  const handleEdit = async (editPrompt) => {
    if (!imageSrc) return;
    const finalPrompt = editPrompt || prompt.trim();
    if (!finalPrompt) return;

    setGenerating(true);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const imageData = await getImageAsBase64(imageSrc);
      const res = await fetch(`${API_BASE}/generate/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: finalPrompt, imageUrl: imageData, model, width, height }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Edit failed');
      const newSrc = data.imageData || data.imageUrl;
      setImageSrc(newSrc);
      const raw = sessionStorage.getItem(`gen_${id}`);
      if (raw) {
        const session = JSON.parse(raw);
        session.resultSrc = newSrc;
        session.prompt = finalPrompt;
        session.model = model;
        sessionStorage.setItem(`gen_${id}`, JSON.stringify(session));
      }
      clearMask();
    } catch (err) {
      if (err.name === 'AbortError') {
        setError(null);
      } else {
        setError(err.message);
      }
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  };

  const handlePresetClick = async (preset) => {
    if (preset.comingSoon) return;
    if (preset.isStyleTransfer) {
      setStylePicker(true);
      setRelightPicker(false);
      setPosePicker(false);
      return;
    }
    if (preset.isRelight) {
      setRelightPicker(true);
      setStylePicker(false);
      setPosePicker(false);
      return;
    }
    if (preset.isPosePicker) {
      if (!imageSrc) return;
      setCheckingCharacter(true);
      setError(null);
      const detectController = new AbortController();
      abortRef.current = detectController;
      try {
        const imageB64 = await getImageAsBase64(imageSrc);
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: detectController.signal,
          body: JSON.stringify({
            image: imageB64,
            query: `Find ALL visible human or humanoid characters in this image. For EACH character, estimate the EXACT pixel position of their body joints as normalized coordinates (0 to 1, where 0,0 is top-left corner and 1,1 is bottom-right corner of the image).

CRITICAL placement rules — be extremely precise:
- "nose" = tip of the nose or center of the face
- "leftShoulder" / "rightShoulder" = where the arm meets the torso, at the shoulder joint
- "leftElbow" / "rightElbow" = the bend point of each arm
- "leftWrist" / "rightWrist" = the wrist/hand position — this MUST be at the end of the arm, where the hand is. If arms are extended outward, wrists should be far from the body center.
- "leftHip" / "rightHip" = where the legs meet the torso, at the waist/belt line
- "leftKnee" / "rightKnee" = the bend point of each leg
- "leftAnkle" / "rightAnkle" = the ankle/foot position at the bottom of each leg

IMPORTANT: "left" and "right" are from the CHARACTER's perspective (mirrored from viewer). If a character faces the viewer, their left arm appears on the RIGHT side of the image.

If arms are spread wide, the wrist x-coordinates should be far apart (close to the character's hand tips). If legs are apart, ankle x-coordinates should reflect that spread.

Reply ONLY with valid JSON, no markdown:
{"hasCharacter": true, "characters": [{"joints": {"nose": {"x": 0.3, "y": 0.1}, "leftShoulder": {"x": 0.25, "y": 0.25}, "rightShoulder": {"x": 0.35, "y": 0.25}, "leftElbow": {"x": 0.15, "y": 0.3}, "rightElbow": {"x": 0.45, "y": 0.3}, "leftWrist": {"x": 0.08, "y": 0.35}, "rightWrist": {"x": 0.52, "y": 0.35}, "leftHip": {"x": 0.27, "y": 0.52}, "rightHip": {"x": 0.33, "y": 0.52}, "leftKnee": {"x": 0.26, "y": 0.72}, "rightKnee": {"x": 0.34, "y": 0.72}, "leftAnkle": {"x": 0.25, "y": 0.9}, "rightAnkle": {"x": 0.35, "y": 0.9}}}]}

For multiple characters, add more objects to the array.
If no character: {"hasCharacter": false, "reason": "explanation"}`
          }),
        });
        const data = await res.json();
        if (!data.hasCharacter) {
          setError('No character detected. Pose editing requires a visible character in the image.');
          return;
        }
        // Parse detected characters into skeleton array
        const parseSkeleton = (joints) => {
          const skel = { ...DEFAULT_SKELETON };
          if (joints && typeof joints === 'object') {
            for (const [key, val] of Object.entries(joints)) {
              if (skel[key] && typeof val?.x === 'number' && typeof val?.y === 'number') {
                skel[key] = { x: Math.max(0, Math.min(1, val.x)), y: Math.max(0, Math.min(1, val.y)) };
              }
            }
          }
          return skel;
        };

        if (Array.isArray(data.characters) && data.characters.length > 0) {
          setSkeletons(data.characters.map(c => parseSkeleton(c.joints)));
        } else if (data.joints) {
          // Backward compat: single joints object
          setSkeletons([parseSkeleton(data.joints)]);
        } else {
          setSkeletons([{ ...DEFAULT_SKELETON }]);
        }
        setPoseNote('');
        setPosePicker(true);
      } catch (err) {
        if (err?.name === 'AbortError') return;
        setSkeletons([{ ...DEFAULT_SKELETON }]);
        setPoseNote('');
        setPosePicker(true);
      } finally {
        setCheckingCharacter(false);
        abortRef.current = null;
      }
      return;
    }
    setPrompt(preset.prompt);
    handleEdit(preset.prompt);
  };

  const handleStyleTransfer = (style) => {
    const p = `Apply a ${style.label} art style to this image, transform it into ${style.label.toLowerCase()} aesthetic while preserving the composition and subjects`;
    setSelectedStyle(style.id);
    setPrompt(p);
    setStylePicker(false);
    handleEdit(p);
  };

  const handleRelightOption = (option) => {
    setPrompt(option.prompt);
    setRelightPicker(false);
    handleEdit(option.prompt);
  };

  // ─── Pose editor handlers (RAF-throttled for smooth dragging) ───
  const poseRAF = useRef(null);
  const poseSVGRef = useRef(null);

  const handleJointDown = (charIdx, jointName, e) => {
    e.stopPropagation();
    e.preventDefault();
    draggingJoint.current = { charIdx, jointName };
  };

  const handlePoseSVGMove = useCallback((e) => {
    if (!draggingJoint.current || !poseSVGRef.current) return;
    e.preventDefault();
    if (poseRAF.current) return; // skip if RAF pending
    poseRAF.current = requestAnimationFrame(() => {
      poseRAF.current = null;
      if (!draggingJoint.current || !poseSVGRef.current) return;
      const rect = poseSVGRef.current.getBoundingClientRect();
      const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      const { charIdx, jointName } = draggingJoint.current;
      setSkeletons(prev => {
        const next = [...prev];
        next[charIdx] = { ...next[charIdx], [jointName]: { x: nx, y: ny } };
        return next;
      });
    });
  }, []);

  const handlePoseSVGUp = useCallback(() => {
    draggingJoint.current = null;
    if (poseRAF.current) { cancelAnimationFrame(poseRAF.current); poseRAF.current = null; }
  }, []);

  const handlePoseGenerate = () => {
    const parts = skeletons.map((skel, i) => {
      const desc = buildPosePrompt(skel);
      return skeletons.length > 1 ? `character ${i + 1}: ${desc}` : desc;
    });
    const final = parts.join('; ') + (poseNote.trim() ? `, ${poseNote.trim()}` : '') + ', keep same character identities, clothing, and art style';
    console.log('[pose] Generated prompt:', final);
    setPosePicker(false);
    // Don't show pose prompt in the prompt bar — it's internal
    handleEdit(final);
  };

  // ─── Video generation ───
  const handleGenerateVideo = async () => {
    if (generatingVideo) return;
    setGeneratingVideo(true);
    setPreviewTab('video');
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Auto-generate prompt if user didn't type one
      let videoPrompt = prompt.trim();
      if (!videoPrompt && imageSrc) {
        const imageB64 = await getImageAsBase64(imageSrc);
        videoPrompt = await generateVideoPrompt(imageB64, controller.signal);
        console.log('[video] Auto-prompt:', videoPrompt);
      }
      if (!videoPrompt) videoPrompt = 'cinematic scene, smooth motion, high quality';

      const result = await generateVideo({
        prompt: videoPrompt,
        model: videoModel,
        width,
        height,
        duration: 5,
        imageUrl: imageSrc,
        signal: controller.signal,
      });

      if (!result.success) {
        if (result.error !== 'Cancelled') setError(result.error);
        return;
      }

      setVideoSrc(result.videoData);
      setPreviewTab('video');
      // Save to session
      const raw = sessionStorage.getItem(`gen_${id}`);
      if (raw) {
        const session = JSON.parse(raw);
        session.videoData = result.videoData;
        sessionStorage.setItem(`gen_${id}`, JSON.stringify(session));
      }
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message);
    } finally {
      setGeneratingVideo(false);
      abortRef.current = null;
    }
  };

  const handleImportImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result);
      setImageSize({ w: 0, h: 0 });
      setSelected(false);
      clearMask();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleZoomIn = () => setZoom((z) => Math.min(z + 25, 400));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 25, 10));
  const handleZoomReset = () => { setZoom(100); setPanOffset({ x: 0, y: 0 }); };

  const getCursor = () => {
    if (activeTool === 'select') return isPanning.current ? 'grabbing' : 'grab';
    if (activeTool === 'sketch' || activeTool === 'eraser') return 'crosshair';
    return 'default';
  };

  const activeModels = previewTab === 'video' ? videoModels : editModels;
  const activeModelId = previewTab === 'video' ? videoModel : model;
  const selectedModel = activeModels.find((m) => m.id === activeModelId) || activeModels[0];

  return (
    <div className={styles.page}>
      {/* Top bar */}
      <div className={styles.topBar}>
        <button className={styles.exitBtn} onClick={() => router.push(`/generate/${id}`)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Exit the editor
        </button>

        <div className={styles.topCenter}>
          <div className={styles.zoomControls}>
            <button className={styles.zoomBtn} onClick={handleZoomOut}>-</button>
            <button className={styles.zoomBtn} onClick={handleZoomReset}>{zoom}%</button>
            <button className={styles.zoomBtn} onClick={handleZoomIn}>+</button>
          </div>
        </div>

        <div className={styles.topRight}>
          {selectedModel && (
            <div className={styles.modelSelector}>
              <button className={styles.modelBtn} onClick={() => setModelOpen(!modelOpen)}>
                {selectedModel.label}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {modelOpen && (
                <div className={styles.modelDropdown}>
                  {activeModels.map((m) => (
                    <button
                      key={m.id}
                      className={`${styles.modelItem} ${m.id === activeModelId ? styles.modelItemActive : ''}`}
                      onClick={() => {
                        if (previewTab === 'video') setVideoModel(m.id);
                        else setModel(m.id);
                        setModelOpen(false);
                      }}
                    >
                      <span>{m.label}</span>
                      <span className={styles.modelDesc}>{m.desc}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className={styles.editorLayout}>
        {/* Left toolbar */}
        <div className={styles.toolbar}>
          {TOOLS.map((t) => (
            <div key={t.id} className={styles.toolWrap}>
              <button
                className={`${styles.toolBtn} ${activeTool === t.id && !posePicker ? styles.toolActive : ''}`}
                onClick={() => { if (posePicker) return; setActiveTool(t.id); if (t.id !== 'select') setSelected(false); }}
                title={t.label}
                disabled={posePicker}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  {TOOL_ICONS[t.id]}
                </svg>
              </button>
              <div className={styles.helpBtnWrap}>
                <span className={styles.helpBtn}>?</span>
                <div className={styles.helpTooltip}>{t.hint}</div>
              </div>
            </div>
          ))}

          <div className={styles.toolDivider} />

          {/* Canvas modes */}
          {CANVAS_MODES.map((m) => (
            <div key={m.id} className={styles.toolWrap}>
              <button
                className={`${styles.toolBtn} ${canvasMode === m.id && !posePicker ? styles.toolActive : ''}`}
                onClick={() => { if (!posePicker) setCanvasMode(m.id); }}
                title={m.label}
                disabled={posePicker}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  {m.icon}
                </svg>
              </button>
              <div className={styles.helpBtnWrap}>
                <span className={styles.helpBtn}>?</span>
                <div className={styles.helpTooltip}>{m.hint}</div>
              </div>
            </div>
          ))}

          <div className={styles.toolDivider} />

          {EDIT_PRESETS.map((p) => (
            <button
              key={p.id}
              className={`${styles.toolBtn} ${p.comingSoon ? styles.toolComingSoon : ''}`}
              onClick={() => !p.comingSoon && handlePresetClick(p)}
              title={p.comingSoon ? `${p.label} (Coming Soon)` : p.label}
              disabled={generating || !imageSrc || p.comingSoon || posePicker}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                {p.icon}
              </svg>
            </button>
          ))}

          <div className={styles.toolDivider} />

          {/* Generate video from canvas */}
          <button
            className={`${styles.toolBtn} ${generatingVideo ? styles.toolActive : ''}`}
            onClick={() => {
              if (!imageSrc || generatingVideo) return;
              handleGenerateVideo();
            }}
            title="Generate video from this image"
            disabled={!imageSrc || generatingVideo || posePicker}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </button>

          <div className={styles.toolbarSpacer} />

          {/* Import image */}
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImportImage} style={{ display: 'none' }} />
          <button className={styles.toolBtn} onClick={() => fileInputRef.current?.click()} title="Import image (or Ctrl+V)" disabled={posePicker}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </button>

          <button className={styles.toolBtn} onClick={handleUndo} disabled={undoStack.length === 0 || posePicker} title="Undo (Ctrl+Z)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 105.64-11.36L1 10" />
            </svg>
          </button>
        </div>

        {/* Canvas + prompt bar area */}
        <div className={styles.canvasColumn}>
          {/* Image / Video tabs */}
          {(videoSrc || generatingVideo) && (
            <div className={styles.previewTabs}>
              <button
                className={`${styles.previewTab} ${previewTab === 'image' ? styles.previewTabActive : ''}`}
                onClick={() => setPreviewTab('image')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
                Image
              </button>
              <button
                className={`${styles.previewTab} ${previewTab === 'video' ? styles.previewTabActive : ''}`}
                onClick={() => setPreviewTab('video')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Video
                {generatingVideo && <span className={styles.tabSpinner} />}
              </button>
            </div>
          )}

          {/* Canvas viewport */}
          <div
            className={styles.canvasArea}
            ref={containerRef}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerLeave={handleCanvasPointerUp}
            style={{ cursor: getCursor(), display: previewTab === 'video' ? 'none' : undefined }}
          >
            {imageSrc ? (
              <div
                className={styles.canvasWrap}
                style={{
                  transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom / 100})`,
                }}
              >
                <div
                  className={`${styles.imageFrame} ${selected ? styles.imageSelected : ''}`}
                  style={imageSize.w > 0 ? { width: imageSize.w, height: imageSize.h } : undefined}
                >
                  <img
                    ref={imgRef}
                    src={imageSrc}
                    alt="Edit canvas"
                    className={styles.canvasImage}
                    onLoad={initMaskCanvas}
                    draggable={false}
                    style={imageSize.w > 0 ? { width: '100%', height: '100%' } : undefined}
                  />
                  <canvas
                    ref={maskCanvasRef}
                    className={styles.maskCanvas}
                  />
                  {selected && !posePicker && (
                    <>
                      <div className={`${styles.handle} ${styles.handleTL}`} onPointerDown={(e) => startResize('TL', e)} />
                      <div className={`${styles.handle} ${styles.handleTR}`} onPointerDown={(e) => startResize('TR', e)} />
                      <div className={`${styles.handle} ${styles.handleBL}`} onPointerDown={(e) => startResize('BL', e)} />
                      <div className={`${styles.handle} ${styles.handleBR}`} onPointerDown={(e) => startResize('BR', e)} />
                      <div className={styles.sizeLabel}>{imageSize.w} x {imageSize.h}</div>
                    </>
                  )}
                  {/* Skeleton overlays — one per detected character */}
                  {posePicker && (
                    <svg
                      ref={poseSVGRef}
                      className={styles.poseSVG}
                      viewBox="0 0 1 1"
                      preserveAspectRatio="none"
                      onPointerMove={handlePoseSVGMove}
                      onPointerUp={handlePoseSVGUp}
                      onPointerLeave={handlePoseSVGUp}
                      style={{ touchAction: 'none' }}
                    >
                      {skeletons.map((skel, charIdx) => (
                        <g key={charIdx}>
                          {POSE_LIMBS.map(([a, b, color], i) => (
                            <line
                              key={i}
                              x1={skel[a].x} y1={skel[a].y}
                              x2={skel[b].x} y2={skel[b].y}
                              stroke={color} strokeWidth="0.008" strokeLinecap="round"
                              opacity={0.85}
                            />
                          ))}
                          {Object.entries(skel).map(([name, pos]) => (
                            <circle
                              key={name}
                              cx={pos.x} cy={pos.y} r="0.012"
                              fill="#fff" stroke={JOINT_COLORS[name]} strokeWidth="0.004"
                              style={{ cursor: 'grab', filter: 'drop-shadow(0 0.002px 0.005px rgba(0,0,0,0.8))' }}
                              onPointerDown={(e) => handleJointDown(charIdx, name, e)}
                            />
                          ))}
                        </g>
                      ))}
                    </svg>
                  )}
                </div>
                {generating && (
                  <div className={styles.canvasLoading}>
                    <div className={styles.canvasSpinner} />
                    <span>Generating...</span>
                    <button className={styles.stopBtn} onClick={handleStop}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
                      Stop
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className={styles.canvasEmpty}>
                <p>No image loaded</p>
                <button className={styles.backBtn} onClick={() => router.push('/generate')}>Go to Generate</button>
              </div>
            )}
          </div>

          {/* Video preview */}
          {previewTab === 'video' && (
            <div className={styles.videoPreview}>
              {videoSrc ? (
                <video src={videoSrc} controls autoPlay loop className={styles.videoPlayer} />
              ) : generatingVideo ? (
                <div className={styles.canvasLoading}>
                  <div className={styles.canvasSpinner} />
                  <span>Generating video...</span>
                  <button className={styles.stopBtn} onClick={handleStop}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
                    Stop
                  </button>
                </div>
              ) : (
                <div className={styles.canvasEmpty}>
                  <p>No video yet</p>
                  <button className={styles.backBtn} onClick={() => setPreviewTab('image')}>Back to Image</button>
                </div>
              )}
            </div>
          )}

          {/* Prompt bar — always at bottom */}
          <div className={styles.promptBar}>
            <input
              type="text"
              className={styles.promptInput}
              placeholder={posePicker ? 'Use pose controls in the panel →' : 'Describe your edit...'}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !posePicker) handleEdit(); }}
              disabled={posePicker}
            />
            <button
              className={styles.generateBtn}
              onClick={() => handleEdit()}
              disabled={generating || !prompt.trim() || !imageSrc || posePicker}
            >
              Generate
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </button>
            <button
              className={styles.videoBtn}
              onClick={handleGenerateVideo}
              disabled={generatingVideo || posePicker}
              title="Generate video from prompt (uses canvas image as reference frame)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              {generatingVideo ? 'Generating...' : 'Video'}
            </button>
          </div>
        </div>

        {/* Right settings panel */}
        <div className={styles.settingsPanel}>

          {/* Pose controls — shown when skeleton is active */}
          {posePicker && (
            <>
              <div className={styles.settingsSection}>
                <h3 className={styles.settingsLabel}>Pose Editor</h3>
                <p className={styles.poseBarHint}>
                  {skeletons.length} character{skeletons.length !== 1 ? 's' : ''} detected. Drag joints to set the target pose.
                </p>
              </div>
              <div className={styles.settingsSection}>
                <span className={styles.settingsLabel}>Pose Note</span>
                <input
                  type="text"
                  className={styles.poseBarInput}
                  placeholder="e.g. sitting, dancing, arms crossed..."
                  value={poseNote}
                  onChange={(e) => setPoseNote(e.target.value)}
                />
              </div>
              <div className={styles.settingsSection}>
                <div className={styles.poseActions}>
                  <button className={styles.poseResetBtn} onClick={() => setSkeletons(prev => prev.map(() => ({ ...DEFAULT_SKELETON })))}>Reset Skeleton</button>
                  <button className={styles.poseGenerateBtn} onClick={handlePoseGenerate} disabled={generating}>Generate</button>
                </div>
                <button className={styles.poseCloseBtn} onClick={() => setPosePicker(false)}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                  Close Pose Editor
                </button>
              </div>
            </>
          )}

          <div className={styles.settingsSection}>
            <div className={styles.settingsRow}>
              <span className={styles.settingsLabel}>Brush Size</span>
              <span className={styles.settingsValue}>{brushSize}px</span>
            </div>
            <input
              type="range" min="5" max="100"
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className={styles.slider}
            />
          </div>

          <div className={styles.settingsSection}>
            <h3 className={styles.settingsLabel}>Image Dimensions</h3>
            <div className={styles.dimGrid}>
              {[[512, 512], [768, 768], [512, 1024], [768, 1024], [1024, 768], [1024, 1024]].map(([w, h]) => (
                <button
                  key={`${w}x${h}`}
                  className={`${styles.dimBtn} ${width === w && height === h ? styles.dimBtnActive : ''}`}
                  onClick={() => { setWidth(w); setHeight(h); }}
                >
                  {w} x {h}
                </button>
              ))}
            </div>
          </div>

          {/* Style Transfer — shown when active */}
          {stylePicker && (
            <>
              <div className={styles.settingsSection}>
                <div className={styles.settingsRow}>
                  <h3 className={styles.settingsLabel}>Style Transfer</h3>
                  <button className={styles.poseCloseBtn} onClick={() => setStylePicker(false)} style={{ width: 'auto', padding: '0.2rem 0.5rem' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    Close
                  </button>
                </div>
                <div className={styles.styleGrid}>
                  {STYLE_PRESETS.map((s) => (
                    <button
                      key={s.id}
                      className={`${styles.styleCard} ${selectedStyle === s.id ? styles.styleCardActive : ''}`}
                      onClick={() => handleStyleTransfer(s)}
                      disabled={generating}
                    >
                      <img src={s.image} alt={s.label} className={styles.styleImg} loading="lazy" />
                      <span className={styles.styleLabel}>{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Relight — shown when active */}
          {relightPicker && (
            <>
              <div className={styles.settingsSection}>
                <div className={styles.settingsRow}>
                  <h3 className={styles.settingsLabel}>Relight Scene</h3>
                  <button className={styles.poseCloseBtn} onClick={() => setRelightPicker(false)} style={{ width: 'auto', padding: '0.2rem 0.5rem' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    Close
                  </button>
                </div>
                <div className={styles.relightGrid}>
                  {RELIGHT_OPTIONS.map((o) => (
                    <button key={o.id} className={styles.relightCard} onClick={() => handleRelightOption(o)} disabled={generating}>
                      <span className={styles.relightLabel}>{o.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {error && <p className={styles.error}>{error}</p>}
        </div>
      </div>

      {/* Style Transfer Picker */}
      {/* Character checking overlay */}
      {checkingCharacter && (
        <div className={styles.pickerOverlay}>
          <div className={styles.checkingBox}>
            <div className={styles.canvasSpinner} />
            <span>Detecting character pose...</span>
            <button className={styles.stopBtn} onClick={handleStop}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
              Stop
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
