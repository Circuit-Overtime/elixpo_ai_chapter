/* eslint-disable */
// Image tool event handlers - extracted from imageTool.js
import { pushCreateAction, pushDeleteAction, pushTransformAction, pushFrameAttachmentAction } from '../core/UndoRedo.js';
import { updateAttachedArrows as updateArrowsForShape, cleanupAttachments } from './arrowTool.js';
import { compressImage } from '../utils/imageCompressor.js';
import { isAllowedImage, IMAGE_ACCEPT_ATTR } from '../utils/allowedImageTypes.js';
import { registerRotationAnchor } from '../core/ScreenSpaceControls.js';


let isDraggingImage = false;
let imageToPlace = null;
let imageX = 0;
let imageY = 0;
let scaleFactor = 0.2;
let currentImageElement = null;

let selectedImage = null;
let originalX, originalY, originalWidth, originalHeight;
let currentAnchor = null;
let isDragging = false;
let isRotatingImage = false;
let dragOffsetX, dragOffsetY;
let startRotationMouseAngle = null;
let startImageRotation = null;
let imageRotation = 0;
let aspect_ratio_lock = true;
const minImageSize = 20;

// Frame attachment variables
let draggedShapeInitialFrameImage = null;
let hoveredFrameImage = null;

if (!window.__roomImageBytesUsed) window.__roomImageBytesUsed = 0;

function getRoomImageLimitBytes() {
    return Number(window.__roomImageLimitBytes) || 2 * 1024 * 1024;
}

function usesPersonalCloudinary() {
    return Boolean(window.__personalCloudinary?.connected && window.__personalCloudinary?.useForUploads);
}


// Convert SVG element to our ImageShape class
function wrapImageElement(element) {
    const imageShape = new ImageShape(element);
    return imageShape;
}

/**
 * Async image upload pipeline:
 * 1. Show loading indicator on the image
 * 2. Compress the image adaptively
 * 3. Get a signed upload URL from the worker
 * 4. Upload compressed image to Cloudinary
 * 5. Replace the base64 href with Cloudinary URL
 * 6. Remove loading indicator
 */
async function uploadImageToCloudinary(imageShape) {
    const workerUrl = window.__WORKER_URL;
    const sessionId = window.__sessionID;
    if (!workerUrl || !sessionId) return;

    const href = imageShape.element.getAttribute('href') || '';
    if (!href.startsWith('data:')) return; // already a URL, skip

    imageShape.uploadStatus = 'uploading';
    imageShape.uploadAbortController = new AbortController();
    const signal = imageShape.uploadAbortController.signal;

    imageShape.showUploadIndicator();

    try {
        // Step 1: Compress
        const compressed = await compressImage(href);
        if (signal.aborted) return;

        const roomLimit = getRoomImageLimitBytes();
        const oldSize = imageShape.element.__fileSize || 0;
        if (!usesPersonalCloudinary() && (window.__roomImageBytesUsed || 0) - oldSize + compressed.compressedSize > roomLimit) {
            throw new Error(`Room image limit reached (${Math.round(roomLimit / (1024 * 1024))} MB)`);
        }

        if (usesPersonalCloudinary()) {
            const personalForm = new FormData();
            personalForm.append('file', compressed.blob, `image_${Date.now()}`);
            personalForm.append('sessionId', sessionId);
            const personalResponse = await fetch('/api/images/personal-upload', {
                method: 'POST',
                body: personalForm,
                signal,
            });
            const personalData = await personalResponse.json().catch(() => ({}));
            if (!personalResponse.ok || !personalData.url) {
                throw new Error(personalData.error || 'Personal Cloudinary upload failed');
            }
            imageShape.element.setAttribute('href', personalData.url);
            imageShape.element.setAttribute('data-href', personalData.url);
            imageShape.element.setAttribute('data-cloudinary-id', personalData.publicId);
            imageShape.element.setAttribute('data-storage-provider', 'user_cloudinary');
            imageShape.element.setAttribute('data-storage-cloud-name', personalData.cloudName || '');
            imageShape.element.__fileSize = 0;
            imageShape.element.setAttribute('data-file-size', '0');
            window.__roomImageBytesUsed = Math.max(0, (window.__roomImageBytesUsed || 0) - oldSize);
            imageShape.uploadStatus = 'done';
            return;
        }

        // Step 2: Get signed upload params
        const signRes = await fetch(`${workerUrl}/api/images/sign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId,
                filename: `img_${Date.now()}`,
                sizeBytes: compressed.compressedSize,
            }),
            signal,
        });
        if (!signRes.ok) {
            const errorBody = await signRes.json().catch(() => ({}));
            throw new Error(errorBody.message || 'Failed to get upload signature');
        }
        const signData = await signRes.json();
        if (signal.aborted) return;

        // Step 3: Upload to Cloudinary
        const formData = new FormData();
        formData.append('file', compressed.blob);
        formData.append('api_key', signData.apiKey);
        formData.append('timestamp', String(signData.timestamp));
        formData.append('signature', signData.signature);
        formData.append('folder', signData.folder);
        formData.append('public_id', signData.publicId);

        const uploadRes = await fetch(
            `https://api.cloudinary.com/v1_1/${signData.cloudName}/image/upload`,
            { method: 'POST', body: formData, signal }
        );
        if (!uploadRes.ok) throw new Error('Cloudinary upload failed');
        const uploadData = await uploadRes.json();
        if (signal.aborted) return;

        await fetch(`${workerUrl}/api/images/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId,
                publicId: uploadData.public_id || signData.publicId,
                sizeBytes: uploadData.bytes || compressed.compressedSize,
            }),
            signal,
        }).catch(() => {});

        // Step 4: Replace base64 with Cloudinary URL
        const cloudUrl = uploadData.secure_url || uploadData.url;
        imageShape.element.setAttribute('href', cloudUrl);
        imageShape.element.setAttribute('data-href', cloudUrl);
        imageShape.element.setAttribute('data-cloudinary-id', uploadData.public_id);

        // Update file size tracking with actual compressed size
        const newSize = uploadData.bytes || compressed.compressedSize;
        imageShape.element.__fileSize = newSize;
        imageShape.element.setAttribute('data-file-size', String(newSize));
        window.__roomImageBytesUsed = Math.max(0, (window.__roomImageBytesUsed || 0) - oldSize + newSize);

        imageShape.uploadStatus = 'done';
        console.log(`[ImageUpload] Uploaded to Cloudinary: ${cloudUrl} (${(newSize / 1024).toFixed(1)}KB)`);
    } catch (err) {
        if (signal.aborted) {
            console.log('[ImageUpload] Upload aborted (image deleted)');
            return;
        }
        console.warn('[ImageUpload] Upload failed:', err);
        imageShape.uploadStatus = 'failed';
    } finally {
        imageShape.removeUploadIndicator();
        imageShape.uploadAbortController = null;
    }
}

document.getElementById("importImage")?.addEventListener('click', () => {
    console.log('Import image clicked');
    isImageToolActive = true;
    console.log('isImageToolActive set to:', isImageToolActive);

    // Create a file input element
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = IMAGE_ACCEPT_ATTR; // Static images only — see allowedImageTypes.js
    fileInput.style.display = 'none'; // Hide the input element
    
    // Add the input to the document temporarily
    document.body.appendChild(fileInput);
    
    let fileSelected = false;

    // Handle file selection
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            fileSelected = true;
            handleImageUpload(file);
        }
        document.body.removeChild(fileInput);
    });

    // Detect cancel
    const onFocus = () => {
        window.removeEventListener('focus', onFocus);
        setTimeout(() => {
            if (!fileSelected) {
                isImageToolActive = false;
                if (window.__sketchEngine?.setActiveTool) {
                    window.__sketchEngine.setActiveTool('select');
                }
                if (fileInput.parentNode) {
                    document.body.removeChild(fileInput);
                }
            }
        }, 300);
    };
    window.addEventListener('focus', onFocus);

    // Trigger the file picker
    fileInput.click();
});


const loadHardcodedImage = (imagePath) => {
    console.log('Loading hardcoded image:', imagePath);
    const img = new Image();
    img.onload = () => {
        console.log('Image loaded successfully');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        imageToPlace = canvas.toDataURL();
        isDraggingImage = true;
        console.log('Image ready to place, isDraggingImage:', isDraggingImage);
    };
    img.onerror = (error) => {
        console.error('Failed to load the hardcoded image:', error);
        console.error('Image path:', imagePath);
    };
    img.src = imagePath;
};

const handleImageUpload = async (file) => {
    if (!file || !isImageToolActive) return;

    // Validate file type against the canonical allowlist (avif, jpeg, jpg,
    // png, bmp, svg, webp). Animated GIF, HEIC, TIFF, video, audio, and
    // arbitrary files are rejected here.
    if (!isAllowedImage(file)) {
        console.error('Rejected file type:', file.type, file.name);
        alert('Unsupported file type. Allowed: AVIF, JPEG, PNG, BMP, SVG, WebP.');
        isImageToolActive = false;
        return;
    }

    const roomImageLimitBytes = getRoomImageLimitBytes();
    const personalStorage = usesPersonalCloudinary();
    if (!personalStorage && window.__roomImageBytesUsed + file.size > roomImageLimitBytes) {
        const usedMB = (window.__roomImageBytesUsed / (1024 * 1024)).toFixed(2);
        const fileMB = (file.size / (1024 * 1024)).toFixed(2);
        alert(`Room image limit reached (${Math.round(roomImageLimitBytes / (1024 * 1024))} MB). Used: ${usedMB} MB, this file: ${fileMB} MB. Delete some images to free space.`);
        isImageToolActive = false;
        return;
    }

    const maxSize = personalStorage ? 20 * 1024 * 1024 : roomImageLimitBytes;
    if (file.size > maxSize) {
        console.error('File size too large');
        alert(`Image file is too large. Please select an image smaller than ${Math.round(maxSize / (1024 * 1024))} MB.`);
        return;
    }

    console.log('Processing image file:', file.name, 'Size:', file.size, 'Type:', file.type);

    // Read → optionally compress → place. We compress client-side BEFORE
    // placement so that consumers without an upload pipeline (VS Code
    // extension, offline npm usage) still embed a compressed data URL
    // rather than the original. SVGs are passed through unchanged because
    // rasterizing them would destroy their vector fidelity.
    try {
        const rawDataUrl = await readFileAsDataUrl(file);
        const isSvg = (file.type || '').toLowerCase() === 'image/svg+xml'
            || (file.name || '').toLowerCase().endsWith('.svg');

        let placedDataUrl = rawDataUrl;
        let placedSize = file.size;
        if (!isSvg) {
            try {
                const compressed = await compressImage(rawDataUrl);
                if (compressed?.dataUrl) {
                    placedDataUrl = compressed.dataUrl;
                    placedSize = compressed.compressedSize || placedSize;
                }
            } catch (err) {
                console.warn('[ImageTool] Pre-placement compression failed, using raw:', err);
            }
        }

        window.__pendingImageFileSize = placedSize;
        imageToPlace = placedDataUrl;
        isDraggingImage = true;
        console.log('Image loaded and ready to place', { size: placedSize, isSvg });
    } catch (err) {
        console.error('Error reading file:', err);
        alert('Error reading the image file. Please try again.');
        isImageToolActive = false;
    }
};

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
    });
}

// Add coordinate conversion function like in other tools
function getSVGCoordsFromMouse(e) {
    const viewBox = svg.viewBox.baseVal;
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const svgX = viewBox.x + (mouseX / rect.width) * viewBox.width;
    const svgY = viewBox.y + (mouseY / rect.height) * viewBox.height;
    return { x: svgX, y: svgY };
}

// Event handler for mousemove on the SVG
const handleMouseMoveImage = (e) => {
    if (!isDraggingImage || !imageToPlace || !isImageToolActive) return; // Also check isImageToolActive

    // Get mouse coordinates relative to the SVG element
    const { x, y } = getSVGCoordsFromMouse(e);
    imageX = x;
    imageY = y;

    drawMiniatureImage();
    
    // Check for frame containment while placing image (but don't apply clipping yet)
    if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
        shapes.forEach(frame => {
            if (frame.shapeName === 'frame') {
                // Create temporary image bounds for frame checking
                const tempImageBounds = {
                    x: imageX - 50, // Half of miniature width
                    y: imageY - 50, // Approximate half height
                    width: 100,
                    height: 100
                };
                
                if (frame.isShapeInFrame(tempImageBounds)) {
                    frame.highlightFrame();
                    hoveredFrameImage = frame;
                } else if (hoveredFrameImage === frame) {
                    frame.removeHighlight();
                    hoveredFrameImage = null;
                }
            }
        });
    }
};

const drawMiniatureImage = () => {
    if (!isDraggingImage || !imageToPlace || !isImageToolActive) return; // Also check isImageToolActive

    const miniatureWidth = 100; // Fixed width for miniature (adjust as needed)
    getImageAspectRatio(imageToPlace)
        .then(aspectRatio => {
            const miniatureHeight = miniatureWidth * aspectRatio;  // Maintain aspect ratio

            // Remove the previous miniature image, if it exists
            if (currentImageElement) {
                svg.removeChild(currentImageElement);
                currentImageElement = null; // Important: clear the reference
            }

            // Create an SVG image element for the miniature
            currentImageElement = document.createElementNS("http://www.w3.org/2000/svg", "image");
            currentImageElement.setAttribute("href", imageToPlace);
            currentImageElement.setAttribute("x", imageX - miniatureWidth / 2); 
            currentImageElement.setAttribute("y", imageY - miniatureHeight / 2);
            currentImageElement.setAttribute("width", miniatureWidth);
            currentImageElement.setAttribute("height", miniatureHeight);
            currentImageElement.setAttribute("preserveAspectRatio", "xMidYMid meet");

            svg.appendChild(currentImageElement);
        })
        .catch(error => {
            console.error("Error getting aspect ratio:", error);
            
        });
};

function getImageAspectRatio(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            resolve(img.height / img.width);
        };
        img.onerror = () => {
            reject(new Error('Failed to load image for aspect ratio calculation.'));
        };
        img.src = dataUrl;
    });
}

// Update the handleMouseDownImage function to create proper group structure
const handleMouseDownImage = async (e) => {
    if (!isDraggingImage || !imageToPlace || !isImageToolActive) {
        // Handle image selection if selection tool is active
        if (isSelectionToolActive) {
            const clickedImage = e.target.closest('image');
            if (clickedImage) {
                selectImage({ target: clickedImage, stopPropagation: () => e.stopPropagation() });
                return;
            }
        }
        return;
    }

    try {
        //Get aspect ratio before we clear the temporary image data.
        let aspectRatio = await getImageAspectRatio(imageToPlace);

        // Remove the miniature
        if (currentImageElement) {
            svg.removeChild(currentImageElement);
            currentImageElement = null;
        }

        // Calculate actual dimensions of the placed image
        const placedImageWidth = 200; // Adjust as needed
        const placedImageHeight = placedImageWidth * aspectRatio;

        // Get SVG coordinates
        const { x: placedX, y: placedY } = getSVGCoordsFromMouse(e);

        // Create a new SVG image element for the final image
        const finalImage = document.createElementNS("http://www.w3.org/2000/svg", "image");
        finalImage.setAttribute("href", imageToPlace);
        finalImage.setAttribute("x", placedX - placedImageWidth / 2);
        finalImage.setAttribute("y", placedY - placedImageHeight / 2);
        finalImage.setAttribute("width", placedImageWidth);
        finalImage.setAttribute("height", placedImageHeight);
        finalImage.setAttribute("preserveAspectRatio", "xMidYMid meet");

        // Store data for undo/redo
        finalImage.setAttribute('data-href', imageToPlace);
        finalImage.setAttribute('data-x', placedX - placedImageWidth / 2);
        finalImage.setAttribute('data-y', placedY - placedImageHeight / 2);
        finalImage.setAttribute('data-width', placedImageWidth);
        finalImage.setAttribute('data-height', placedImageHeight);
        
        // Add arrow attachment support data attributes
        finalImage.setAttribute('type', 'image');
        finalImage.setAttribute('data-shape-x', placedX - placedImageWidth / 2);
        finalImage.setAttribute('data-shape-y', placedY - placedImageHeight / 2);
        finalImage.setAttribute('data-shape-width', placedImageWidth);
        finalImage.setAttribute('data-shape-height', placedImageHeight);
        finalImage.setAttribute('data-shape-rotation', 0);
        finalImage.shapeID = `image-${String(Date.now()).slice(0, 8)}-${Math.floor(Math.random() * 10000)}`;

        // Don't add to SVG directly - let ImageShape wrapper handle it
        // svg.appendChild(finalImage);

        // Create ImageShape wrapper for frame functionality
        const imageShape = wrapImageElement(finalImage);

        // Add to shapes array for arrow attachment and frame functionality
        if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
            shapes.push(imageShape);
            console.log('Image added to shapes array for arrow attachment and frame functionality');
        } else {
            console.warn('shapes array not found - arrows and frames may not work with images');
        }

        // Check for frame containment and track attachment
        const finalFrame = hoveredFrameImage;
        if (finalFrame) {
            finalFrame.addShapeToFrame(imageShape);
            // Track the attachment for undo
            pushFrameAttachmentAction(finalFrame, imageShape, 'attach', null);
        }

        // Add to undo stack for image creation
        pushCreateAction({
            type: 'image',
            element: imageShape,
            remove: () => {
                if (imageShape.group && imageShape.group.parentNode) {
                    imageShape.group.parentNode.removeChild(imageShape.group);
                }
                // Remove from shapes array
                if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
                    const idx = shapes.indexOf(imageShape);
                    if (idx !== -1) shapes.splice(idx, 1);
                }
                // Clean up arrow attachments when image is removed
                if (typeof cleanupAttachments === 'function') {
                    cleanupAttachments(finalImage);
                }
            },
            restore: () => {
                svg.appendChild(imageShape.group);
                // Add back to shapes array
                if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
                    if (shapes.indexOf(imageShape) === -1) {
                        shapes.push(imageShape);
                    }
                }
            }
        });

        // Track image size for room limit
        const placedFileSize = window.__pendingImageFileSize || 0;
        finalImage.__fileSize = placedFileSize;
        finalImage.setAttribute('data-file-size', String(placedFileSize));
        window.__roomImageBytesUsed = (window.__roomImageBytesUsed || 0) + placedFileSize;
        window.__pendingImageFileSize = 0;

        // Add click event to the newly added image
        finalImage.addEventListener('click', selectImage);

        // Clear frame highlighting
        if (hoveredFrameImage) {
            hoveredFrameImage.removeHighlight();
            hoveredFrameImage = null;
        }

        // Auto-select the placed image and switch to selection tool
        const placedShape = imageShape;
        if (window.__sketchStoreApi) window.__sketchStoreApi.setActiveTool('select', { afterDraw: true });
        currentShape = placedShape;
        currentShape.isSelected = true;
        placedShape.selectShape();

        // Fire async upload pipeline. We dispatch via window.uploadImageToCloudinary
        // so embedded hosts (e.g. blogs.elixpo) can swap in a postMessage-based
        // implementation that routes uploads through the host's media API.
        const uploader = (typeof window !== 'undefined' && window.uploadImageToCloudinary) || uploadImageToCloudinary;
        uploader(imageShape).catch(err => {
            console.warn('[ImageTool] Upload pipeline error:', err);
        });

    } catch (error) {
        console.error("Error placing image:", error);
        isDraggingImage = false;
        imageToPlace = null;
        isImageToolActive = false; // Important: Reset the tool state.
    } finally {
        isDraggingImage = false;
        imageToPlace = null;
        isImageToolActive = false; // Important: Reset the tool state.
    }
};

const handleMouseUpImage = (e) => {
    // Only deselect if the user actually clicked (mousedown+mouseup) on a non-image area
    // of the SVG canvas — not when the mouse just leaves to the UI
    if (isSelectionToolActive && selectedImage) {
        const clickedElement = e.target;
        const isOnSVG = clickedElement === svg || clickedElement.ownerSVGElement === svg;
        const isImageElement = clickedElement.tagName === 'image';
        const isAnchorElement = clickedElement.classList.contains('resize-anchor') ||
                               clickedElement.classList.contains('rotation-anchor') ||
                               clickedElement.classList.contains('selection-outline');

        // Only deselect if mouseup is directly on the SVG background (not on any shape/anchor)
        if (isOnSVG && !isImageElement && !isAnchorElement && clickedElement === svg && !isDragging && !isRotatingImage && !currentAnchor) {
            removeSelectionOutline();
            selectedImage = null;
            if (window.__sketchStoreApi) {
                window.__sketchStoreApi.clearSelectedShapeSidebar();
            }
        }
    }
    
    // Clear frame highlighting if placing image
    if (hoveredFrameImage) {
        hoveredFrameImage.removeHighlight();
        hoveredFrameImage = null;
    }
};

function selectImage(event, force = false) {
    if (!isSelectionToolActive && !force) return;

    event.stopPropagation(); // Prevent click from propagating to the SVG

    if (selectedImage) {
        removeSelectionOutline();
    }

    selectedImage = event.target;
    
    // Get the current rotation from the image transform attribute
    const transform = selectedImage.getAttribute('transform');
    if (transform) {
        const rotateMatch = transform.match(/rotate\(([^,]+)/);
        if (rotateMatch) {
            imageRotation = parseFloat(rotateMatch[1]);
        }
    } else {
        imageRotation = 0;
    }
    
    addSelectionOutline();

    // Store original dimensions for resizing
    originalX = parseFloat(selectedImage.getAttribute('x'));
    originalY = parseFloat(selectedImage.getAttribute('y'));
    originalWidth = parseFloat(selectedImage.getAttribute('width'));
    originalHeight = parseFloat(selectedImage.getAttribute('height'));

     // Add drag event listeners to the selected image
     selectedImage.addEventListener('pointerdown', startDrag);
     selectedImage.addEventListener('pointerup', stopDrag);
     selectedImage.addEventListener('pointerleave', stopDrag);

    // Set currentShape for sidebar + layer controls
    const imageShape = (typeof shapes !== 'undefined' && Array.isArray(shapes))
        ? shapes.find(s => s.shapeName === 'image' && s.element === selectedImage)
        : null;
    if (imageShape) {
        window.currentShape = imageShape;
    }
    if (typeof window.__showSidebarForShape === 'function') {
        window.__showSidebarForShape('image');
    }
}

function addSelectionOutline() {
    if (!selectedImage) return;

    const x = parseFloat(selectedImage.getAttribute('x'));
    const y = parseFloat(selectedImage.getAttribute('y'));
    const width = parseFloat(selectedImage.getAttribute('width'));
    const height = parseFloat(selectedImage.getAttribute('height'));

    const zoom = window.currentZoom || 1;
    const selectionPadding = 8 / zoom; // Padding around the selection
    const expandedX = x - selectionPadding;
    const expandedY = y - selectionPadding;
    const expandedWidth = width + 2 * selectionPadding;
    const expandedHeight = height + 2 * selectionPadding;

    // Create a dashed outline
    const outlinePoints = [
        [expandedX, expandedY],
        [expandedX + expandedWidth, expandedY],
        [expandedX + expandedWidth, expandedY + expandedHeight],
        [expandedX, expandedY + expandedHeight],
        [expandedX, expandedY]
    ];
    const pointsAttr = outlinePoints.map(p => p.join(',')).join(' ');
    const outline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    outline.setAttribute("points", pointsAttr);
    outline.setAttribute("fill", "none");
    outline.setAttribute("stroke", "#5B57D1");
    outline.setAttribute("stroke-width", 1.5);
    outline.setAttribute("stroke-dasharray", "4 2");
    outline.setAttribute("vector-effect", "non-scaling-stroke");
    outline.setAttribute("style", "pointer-events: none;");
    outline.setAttribute("class", "selection-outline");

    // Apply the same rotation as the image
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    outline.setAttribute('transform', `rotate(${imageRotation}, ${centerX}, ${centerY})`);

    svg.appendChild(outline);

    // Add resize anchors
    addResizeAnchors(expandedX, expandedY, expandedWidth, expandedHeight, centerX, centerY);
    
    // Add rotation anchor
    addRotationAnchor(expandedX, expandedY, expandedWidth, expandedHeight, centerX, centerY);
}

function removeSelectionOutline() {
    // Remove ALL selection outlines (querySelectorAll to prevent stacking)
    svg.querySelectorAll(".selection-outline").forEach(el => el.remove());

    // Remove resize anchors
    removeResizeAnchors();

    // Remove rotation anchor
    removeRotationAnchor();

    // Remove drag event listeners
    if (selectedImage) {
        selectedImage.removeEventListener('pointerdown', startDrag);
        selectedImage.removeEventListener('pointerup', stopDrag);
        selectedImage.removeEventListener('pointerleave', stopDrag);
    }
}

function addResizeAnchors(x, y, width, height, centerX, centerY) {
    const zoom = window.currentZoom || 1;
    const anchorSize = 10 / zoom;
    const anchorStrokeWidth = 2;

    const positions = [
        { x: x, y: y }, // Top-left
        { x: x + width, y: y }, // Top-right
        { x: x, y: y + height }, // Bottom-left
        { x: x + width, y: y + height } // Bottom-right
    ];

    positions.forEach((pos, i) => {
        const anchor = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        anchor.setAttribute("x", pos.x - anchorSize / 2);
        anchor.setAttribute("y", pos.y - anchorSize / 2);
        anchor.setAttribute("width", anchorSize);
        anchor.setAttribute("height", anchorSize);
        anchor.setAttribute("fill", "#121212");
        anchor.setAttribute("stroke", "#5B57D1");
        anchor.setAttribute("stroke-width", anchorStrokeWidth);
        anchor.setAttribute("vector-effect", "non-scaling-stroke");
        anchor.setAttribute("class", "resize-anchor");
        anchor.style.cursor = ["nw-resize", "ne-resize", "sw-resize", "se-resize"][i];

        // Apply the same rotation as the image
        anchor.setAttribute('transform', `rotate(${imageRotation}, ${centerX}, ${centerY})`);

        svg.appendChild(anchor);

        // Add event listeners for resizing
        anchor.addEventListener('pointerdown', startResize);
        anchor.addEventListener('pointerup', stopResize);
    });
}

function addRotationAnchor(x, y, width, height, centerX, centerY) {
    const zoom = window.currentZoom || 1;
    const anchorStrokeWidth = 2;
    const rotationAnchorPos = { x: x + width / 2, y: y - 30 / zoom };
    
    const rotationAnchor = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    rotationAnchor.setAttribute('cx', rotationAnchorPos.x);
    rotationAnchor.setAttribute('cy', rotationAnchorPos.y);
    rotationAnchor.setAttribute('r', 5 / zoom);
    rotationAnchor.setAttribute('class', 'rotation-anchor');
    rotationAnchor.setAttribute('fill', '#121212');
    rotationAnchor.setAttribute('stroke', '#5B57D1');
    rotationAnchor.setAttribute('stroke-width', anchorStrokeWidth);
    rotationAnchor.setAttribute('vector-effect', 'non-scaling-stroke');
    rotationAnchor.setAttribute('style', 'pointer-events: all;');
    
    // Apply the same rotation as the image
    rotationAnchor.setAttribute('transform', `rotate(${imageRotation}, ${centerX}, ${centerY})`);
    
    svg.appendChild(rotationAnchor);
    registerRotationAnchor(rotationAnchor, { radius: 5, edgeY: y });

    // Add event listeners for rotation
    rotationAnchor.addEventListener('pointerdown', startRotation);
    rotationAnchor.addEventListener('pointerup', stopRotation);
    
    rotationAnchor.addEventListener('mouseover', function () {
        if (!isRotatingImage && !isDragging) {
            rotationAnchor.style.cursor = 'grab';
        }
    });
    
    rotationAnchor.addEventListener('mouseout', function () {
        if (!isRotatingImage && !isDragging) {
            rotationAnchor.style.cursor = 'default';
        }
    });
}

function removeRotationAnchor() {
    svg.querySelectorAll(".rotation-anchor").forEach(el => el.remove());
}

function addAnchor(x, y, cursor) {
    const anchorSize = 8 / (window.currentZoom || 1);
    const anchor = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    anchor.setAttribute("x", x);
    anchor.setAttribute("y", y);
    anchor.setAttribute("width", anchorSize);
    anchor.setAttribute("height", anchorSize);
    anchor.setAttribute("fill", "white");
    anchor.setAttribute("stroke", "black");
    anchor.setAttribute("stroke-width", "1");
    anchor.setAttribute("class", "resize-anchor"); // For easy removal
    anchor.style.cursor = cursor;

    svg.appendChild(anchor);

    // Add event listeners for dragging
    anchor.addEventListener('pointerdown', startResize);
    anchor.addEventListener('pointerup', stopResize);

}

function removeResizeAnchors() {
    const anchors = svg.querySelectorAll(".resize-anchor");
    anchors.forEach(anchor => svg.removeChild(anchor));
}

function startResize(event) {
    event.preventDefault();
    event.stopPropagation();

    currentAnchor = event.target;
    
    // Store original values at the start of resize
    originalX = parseFloat(selectedImage.getAttribute('x'));
    originalY = parseFloat(selectedImage.getAttribute('y'));
    originalWidth = parseFloat(selectedImage.getAttribute('width'));
    originalHeight = parseFloat(selectedImage.getAttribute('height'));
    
    // Store original rotation
    const transform = selectedImage.getAttribute('transform');
    if (transform) {
        const rotateMatch = transform.match(/rotate\(([^,]+)/);
        if (rotateMatch) {
            imageRotation = parseFloat(rotateMatch[1]);
        }
    }
    
    svg.addEventListener('pointermove', resizeImage);
    document.addEventListener('pointerup', stopResize);
}

function stopResize(event) {
    stopInteracting(); // Call the combined stop function
    document.removeEventListener('pointerup', stopResize); // Remove the global mouseup listener
}

function resizeImage(event) {
    if (!selectedImage || !currentAnchor) return;

    const { x: globalX, y: globalY } = getSVGCoordsFromMouse(event);

    // Use ORIGINAL center for consistent inverse rotation (avoids drift)
    const centerX = originalX + originalWidth / 2;
    const centerY = originalY + originalHeight / 2;

    // Convert mouse position to local coordinates accounting for rotation
    let localX = globalX;
    let localY = globalY;

    if (imageRotation !== 0) {
        const rotationRad = (imageRotation * Math.PI) / 180;
        const translatedX = globalX - centerX;
        const translatedY = globalY - centerY;
        localX = translatedX * Math.cos(-rotationRad) - translatedY * Math.sin(-rotationRad) + centerX;
        localY = translatedX * Math.sin(-rotationRad) + translatedY * Math.cos(-rotationRad) + centerY;
    }

    // Calculate resize deltas in local coordinate space
    let dx = localX - originalX;
    let dy = localY - originalY;

    let newWidth = originalWidth;
    let newHeight = originalHeight;
    let newX = originalX;
    let newY = originalY;
    const aspectRatio = originalHeight / originalWidth;

    // Track which corner is fixed (relative to original rect)
    let fixedRelX, fixedRelY;

    switch (currentAnchor.style.cursor) {
        case "nw-resize":
            newWidth = originalWidth - dx;
            newHeight = originalHeight - dy;
            if (aspect_ratio_lock) {
                newHeight = newWidth * aspectRatio;
                dy = originalHeight - newHeight;
            }
            newX = originalX + (originalWidth - newWidth);
            newY = originalY + (originalHeight - newHeight);
            fixedRelX = originalWidth; fixedRelY = originalHeight;
            break;
        case "ne-resize":
            newWidth = dx;
            newHeight = originalHeight - dy;
            if (aspect_ratio_lock) {
                newHeight = newWidth * aspectRatio;
                dy = originalHeight - newHeight;
            }
            newX = originalX;
            newY = originalY + (originalHeight - newHeight);
            fixedRelX = 0; fixedRelY = originalHeight;
            break;
        case "sw-resize":
            newWidth = originalWidth - dx;
            newHeight = dy;
            if (aspect_ratio_lock) {
                newHeight = newWidth * aspectRatio;
                dy = newHeight;
            }
            newX = originalX + (originalWidth - newWidth);
            newY = originalY;
            fixedRelX = originalWidth; fixedRelY = 0;
            break;
        case "se-resize":
            newWidth = dx;
            newHeight = dy;
            if (aspect_ratio_lock) {
                newHeight = newWidth * aspectRatio;
            }
            newX = originalX;
            newY = originalY;
            fixedRelX = 0; fixedRelY = 0;
            break;
    }

    // Ensure minimum size
    newWidth = Math.max(minImageSize, newWidth);
    newHeight = Math.max(minImageSize, newHeight);

    // Compensate for rotation center shift when rotated
    if (imageRotation !== 0) {
        const rad = (imageRotation * Math.PI) / 180;
        const cosR = Math.cos(rad);
        const sinR = Math.sin(rad);

        // Compute rotated world position of the fixed corner in the original rect
        const oldCX = originalX + originalWidth / 2;
        const oldCY = originalY + originalHeight / 2;
        const odx = (originalX + fixedRelX) - oldCX;
        const ody = (originalY + fixedRelY) - oldCY;
        const fixedWorldX = oldCX + odx * cosR - ody * sinR;
        const fixedWorldY = oldCY + odx * sinR + ody * cosR;

        // Determine where the fixed corner sits in the new rect (relative to new origin)
        const fixedNewRelX = fixedRelX === 0 ? 0 : newWidth;
        const fixedNewRelY = fixedRelY === 0 ? 0 : newHeight;

        // Solve for new origin so the fixed corner stays in place
        const ncx = newWidth / 2;
        const ncy = newHeight / 2;
        const ndx = fixedNewRelX - ncx;
        const ndy = fixedNewRelY - ncy;
        const rotX = ncx + ndx * cosR - ndy * sinR;
        const rotY = ncy + ndx * sinR + ndy * cosR;

        newX = fixedWorldX - rotX;
        newY = fixedWorldY - rotY;
    }

    // Apply the new dimensions and position
    selectedImage.setAttribute('width', newWidth);
    selectedImage.setAttribute('height', newHeight);
    selectedImage.setAttribute('x', newX);
    selectedImage.setAttribute('y', newY);

    // Update data attributes for arrow attachment
    selectedImage.setAttribute('data-shape-x', newX);
    selectedImage.setAttribute('data-shape-y', newY);
    selectedImage.setAttribute('data-shape-width', newWidth);
    selectedImage.setAttribute('data-shape-height', newHeight);

    // Reapply the rotation transform with the new center
    const newCenterX = newX + newWidth / 2;
    const newCenterY = newY + newHeight / 2;
    selectedImage.setAttribute('transform', `rotate(${imageRotation}, ${newCenterX}, ${newCenterY})`);

    // Update attached arrows during resize
    updateArrowsForShape(selectedImage);

    // Update the selection outline and anchors
    removeSelectionOutline();
    addSelectionOutline();
}

function stopRotation(event) {
    if (!isRotatingImage) return;
    stopInteracting();
    isRotatingImage = false;
    startRotationMouseAngle = null;
    startImageRotation = null;
    svg.removeEventListener('pointermove', rotateImage);
    document.removeEventListener('pointerup', stopRotation);
    svg.style.cursor = 'default';
}

function startDrag(event) {
    if (!isSelectionToolActive || !selectedImage) return;

    event.preventDefault();
    event.stopPropagation();

    isDragging = true;
    
    // Store original values at the start of drag
    originalX = parseFloat(selectedImage.getAttribute('x'));
    originalY = parseFloat(selectedImage.getAttribute('y'));
    originalWidth = parseFloat(selectedImage.getAttribute('width'));
    originalHeight = parseFloat(selectedImage.getAttribute('height'));
    
    // Store original rotation
    const transform = selectedImage.getAttribute('transform');
    if (transform) {
        const rotateMatch = transform.match(/rotate\(([^,]+)/);
        if (rotateMatch) {
            imageRotation = parseFloat(rotateMatch[1]);
        }
    }

    // Find the ImageShape wrapper for frame functionality
    let imageShape = null;
    if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
        imageShape = shapes.find(shape => shape.shapeName === 'image' && shape.element === selectedImage);
    }

    if (imageShape) {
        // Store initial frame state
        draggedShapeInitialFrameImage = imageShape.parentFrame || null;
        
        // Temporarily remove from frame clipping if dragging
        if (imageShape.parentFrame) {
            imageShape.parentFrame.temporarilyRemoveFromFrame(imageShape);
        }
    }

    const { x, y } = getSVGCoordsFromMouse(event);
    dragOffsetX = x - parseFloat(selectedImage.getAttribute('x'));
    dragOffsetY = y - parseFloat(selectedImage.getAttribute('y'));

    svg.addEventListener('pointermove', dragImage);
    document.addEventListener('pointerup', stopDrag);
}

function dragImage(event) {
    if (!isDragging || !selectedImage) return;

    const { x, y } = getSVGCoordsFromMouse(event);
    let newX = x - dragOffsetX;
    let newY = y - dragOffsetY;

    selectedImage.setAttribute('x', newX);
    selectedImage.setAttribute('y', newY);

    // Update data attributes for arrow attachment
    selectedImage.setAttribute('data-shape-x', newX);
    selectedImage.setAttribute('data-shape-y', newY);

    // Reapply the rotation transform with the new position
    const newCenterX = newX + parseFloat(selectedImage.getAttribute('width')) / 2;
    const newCenterY = newY + parseFloat(selectedImage.getAttribute('height')) / 2;
    selectedImage.setAttribute('transform', `rotate(${imageRotation}, ${newCenterX}, ${newCenterY})`);

    // Update frame containment for ImageShape wrapper
    if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
        const imageShape = shapes.find(shape => shape.shapeName === 'image' && shape.element === selectedImage);
        if (imageShape) {
            imageShape.updateFrameContainment();
        }
    }

    // Update attached arrows during drag
    updateArrowsForShape(selectedImage);

    // Update the selection outline and anchors
    removeSelectionOutline();
    addSelectionOutline();
}

function stopDrag(event) {
    stopInteracting(); // Call the combined stop function
    document.removeEventListener('pointerup', stopDrag); // Remove the global mouseup listener
}

function startRotation(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!selectedImage) return;

    isRotatingImage = true;
    
    // Get image center
    const imgX = parseFloat(selectedImage.getAttribute('x'));
    const imgY = parseFloat(selectedImage.getAttribute('y'));
    const imgWidth = parseFloat(selectedImage.getAttribute('width'));
    const imgHeight = parseFloat(selectedImage.getAttribute('height'));
    
    const centerX = imgX + imgWidth / 2;
    const centerY = imgY + imgHeight / 2;

    // Calculate initial mouse angle relative to image center
    const { x: mouseX, y: mouseY } = getSVGCoordsFromMouse(event);
    
    startRotationMouseAngle = Math.atan2(mouseY - centerY, mouseX - centerX) * 180 / Math.PI;
    startImageRotation = imageRotation;

    svg.addEventListener('pointermove', rotateImage);
    document.addEventListener('pointerup', stopRotation);
    
    svg.style.cursor = 'grabbing';
}

function rotateImage(event) {
    if (!isRotatingImage || !selectedImage) return;

    // Get image center
    const imgX = parseFloat(selectedImage.getAttribute('x'));
    const imgY = parseFloat(selectedImage.getAttribute('y'));
    const imgWidth = parseFloat(selectedImage.getAttribute('width'));
    const imgHeight = parseFloat(selectedImage.getAttribute('height'));
    
    const centerX = imgX + imgWidth / 2;
    const centerY = imgY + imgHeight / 2;

    // Calculate current mouse angle
    const { x: mouseX, y: mouseY } = getSVGCoordsFromMouse(event);
    
    const currentMouseAngle = Math.atan2(mouseY - centerY, mouseX - centerX) * 180 / Math.PI;
    const angleDiff = currentMouseAngle - startRotationMouseAngle;
    
    imageRotation = startImageRotation + angleDiff;
    imageRotation = imageRotation % 360;
    if (imageRotation < 0) imageRotation += 360;

    // Apply rotation transform
    selectedImage.setAttribute('transform', `rotate(${imageRotation}, ${centerX}, ${centerY})`);
    
    // Update data attribute for arrow attachment
    selectedImage.setAttribute('data-shape-rotation', imageRotation);

    // Update attached arrows during rotation
    updateArrowsForShape(selectedImage);

    // Update the selection outline and anchors
    removeSelectionOutline();
    addSelectionOutline();
}

function stopInteracting() {
    // Store transform data before stopping interaction
    if (selectedImage && (isDragging || isRotatingImage || currentAnchor)) {
        const newPos = {
            x: parseFloat(selectedImage.getAttribute('x')),
            y: parseFloat(selectedImage.getAttribute('y')),
            width: parseFloat(selectedImage.getAttribute('width')),
            height: parseFloat(selectedImage.getAttribute('height')),
            rotation: imageRotation
        };
        
        // Get the original rotation from the stored start rotation or current rotation
        let originalRotation = imageRotation;
        if (isRotatingImage && startImageRotation !== null) {
            originalRotation = startImageRotation;
        }
        
        const oldPos = {
            x: originalX,
            y: originalY,
            width: originalWidth,
            height: originalHeight,
            rotation: originalRotation
        };

        // Find the ImageShape wrapper for frame tracking
        let imageShape = null;
        if (typeof shapes !== 'undefined' && Array.isArray(shapes)) {
            imageShape = shapes.find(shape => shape.shapeName === 'image' && shape.element === selectedImage);
        }

        // Add frame information for undo tracking
        const oldPosWithFrame = {
            ...oldPos,
            parentFrame: draggedShapeInitialFrameImage
        };
        // Issue #34 bug #2: for drag, hoveredFrameImage tracks the actual
        // destination — imageShape.parentFrame is still the OLD frame here.
        // Resize / rotate don't move between frames, so fall back to the
        // shape's own parent for those.
        const newPosWithFrame = {
            ...newPos,
            parentFrame: isDragging
                ? (hoveredFrameImage || null)
                : (imageShape ? imageShape.parentFrame : null),
        };

        // Only push transform action if something actually changed
        const stateChanged = newPos.x !== oldPos.x || newPos.y !== oldPos.y || 
                           newPos.width !== oldPos.width || newPos.height !== oldPos.height ||
                           newPos.rotation !== oldPos.rotation;
        const frameChanged = oldPosWithFrame.parentFrame !== newPosWithFrame.parentFrame;

        if (stateChanged || frameChanged) {
            pushTransformAction({
                type: 'image',
                element: selectedImage,
                restore: (pos) => {
                    selectedImage.setAttribute('x', pos.x);
                    selectedImage.setAttribute('y', pos.y);
                    selectedImage.setAttribute('width', pos.width);
                    selectedImage.setAttribute('height', pos.height);
                    const centerX = pos.x + pos.width / 2;
                    const centerY = pos.y + pos.height / 2;
                    selectedImage.setAttribute('transform', `rotate(${pos.rotation}, ${centerX}, ${centerY})`);
                    imageRotation = pos.rotation;
                    
                    // Update selection outline if image is selected
                    if (selectedImage) {
                        removeSelectionOutline();
                        addSelectionOutline();
                    }
                    
                    // Update data attributes for arrow attachment consistency
                    selectedImage.setAttribute('data-shape-x', pos.x);
                    selectedImage.setAttribute('data-shape-y', pos.y);
                    selectedImage.setAttribute('data-shape-width', pos.width);
                    selectedImage.setAttribute('data-shape-height', pos.height);
                    selectedImage.setAttribute('data-shape-rotation', pos.rotation);
                    
                    // Update attached arrows
                    updateArrowsForShape(selectedImage);
                }
            }, oldPosWithFrame, newPosWithFrame);
        }

        // Handle frame containment changes after drag
        if (isDragging && imageShape) {
            const finalFrame = hoveredFrameImage;
            
            // If shape moved to a different frame
            if (draggedShapeInitialFrameImage !== finalFrame) {
                // Remove from initial frame
                if (draggedShapeInitialFrameImage) {
                    draggedShapeInitialFrameImage.removeShapeFromFrame(imageShape);
                }
                
                // Add to new frame
                if (finalFrame) {
                    finalFrame.addShapeToFrame(imageShape);
                }
                
                // Track the frame change for undo
                if (frameChanged) {
                    pushFrameAttachmentAction(finalFrame || draggedShapeInitialFrameImage, imageShape, 
                        finalFrame ? 'attach' : 'detach', draggedShapeInitialFrameImage);
                }
            } else if (draggedShapeInitialFrameImage) {
                // Shape stayed in same frame, restore clipping
                draggedShapeInitialFrameImage.restoreToFrame(imageShape);
            }
        }
        
        draggedShapeInitialFrameImage = null;
    }

    // Clear frame highlighting
    if (hoveredFrameImage) {
        hoveredFrameImage.removeHighlight();
        hoveredFrameImage = null;
    }

    isDragging = false;
    isRotatingImage = false;
    svg.removeEventListener('pointermove', dragImage);
    svg.removeEventListener('pointermove', resizeImage);
    svg.removeEventListener('pointermove', rotateImage);
    currentAnchor = null;
    startRotationMouseAngle = null;
    startImageRotation = null;

    // Update originalX, originalY, originalWidth and originalHeight after dragging/resizing is complete
    if (selectedImage) {
        originalX = parseFloat(selectedImage.getAttribute('x'));
        originalY = parseFloat(selectedImage.getAttribute('y'));
        originalWidth = parseFloat(selectedImage.getAttribute('width'));
        originalHeight = parseFloat(selectedImage.getAttribute('height'));
        
        // Update the current rotation from the image transform
        const transform = selectedImage.getAttribute('transform');
        if (transform) {
            const rotateMatch = transform.match(/rotate\(([^,]+)/);
            if (rotateMatch) {
                imageRotation = parseFloat(rotateMatch[1]);
            }
        }
        
        // Update data attributes for arrow attachment consistency
        selectedImage.setAttribute('data-shape-x', originalX);
        selectedImage.setAttribute('data-shape-y', originalY);
        selectedImage.setAttribute('data-shape-width', originalWidth);
        selectedImage.setAttribute('data-shape-height', originalHeight);
        selectedImage.setAttribute('data-shape-rotation', imageRotation);
        
        // Update attached arrows after interaction ends
        updateArrowsForShape(selectedImage);
    }
}

// Add delete functionality for images
function deleteCurrentImage() {
    if (selectedImage) {
        // Find the ImageShape wrapper
        let imageShape = (typeof shapes !== 'undefined' && Array.isArray(shapes))
            ? shapes.find(s => s.shapeName === 'image' && s.element === selectedImage)
            : null;

        // Abort any in-progress upload
        if (imageShape?.uploadAbortController) {
            imageShape.uploadAbortController.abort();
            imageShape.removeUploadIndicator();
        }

        // Release image bytes from room limit
        const freedBytes = selectedImage.__fileSize || 0;
        window.__roomImageBytesUsed = Math.max(0, (window.__roomImageBytesUsed || 0) - freedBytes);

        // If image is hosted on Cloudinary, delete it from storage
        const imgHref = selectedImage.getAttribute('href') || selectedImage.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '';
        if (imgHref.includes('cloudinary.com') || imgHref.includes('res.cloudinary')) {
            const match = imgHref.match(/\/upload\/(?:v\d+\/)?(lixsketch\/.+?)(?:\.\w+)?$/);
            if (match) {
                const publicId = match[1];
                const isPersonal = selectedImage.getAttribute('data-storage-provider') === 'user_cloudinary';
                const workerUrl = window.__WORKER_URL;
                const deleteUrl = isPersonal ? '/api/images/personal-delete' : (workerUrl ? `${workerUrl}/api/images/delete` : null);
                if (deleteUrl) {
                    fetch(deleteUrl, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ publicId }),
                    }).catch(err => console.warn('[ImageTool] Cloudinary cleanup failed:', err));
                }
            }
        }

        if (imageShape) {
            const idx = shapes.indexOf(imageShape);
            if (idx !== -1) shapes.splice(idx, 1);

            // Remove the group (which contains the image)
            if (imageShape.group && imageShape.group.parentNode) {
                imageShape.group.parentNode.removeChild(imageShape.group);
            }
        }
        
        // Fallback: if no ImageShape wrapper found, remove the image directly
        if (!imageShape && selectedImage.parentNode) {
            selectedImage.parentNode.removeChild(selectedImage);
        }
        
        // Clean up any arrow attachments before deleting
        if (typeof cleanupAttachments === 'function') {
            cleanupAttachments(selectedImage);
        }
        
        // Push delete action for undo
        if (imageShape) {
            pushDeleteAction(imageShape);
        }
        
        // Clean up selection
        removeSelectionOutline();
        selectedImage = null;
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' && selectedImage) {
        deleteCurrentImage();
    }
});

// Expose upload pipeline globally so generated/pasted images can use it
window.uploadImageToCloudinary = uploadImageToCloudinary;

// Programmatic selection bridge used by generated vector-image shapes.
// Keeping the selection state in this module prevents a second, divergent
// implementation of image dragging and screen-space resize controls.
window.__selectImageElement = function(element, { force = false } = {}) {
    if (!element) return;
    selectImage({ target: element, stopPropagation: () => {} }, force);
};

// Window bridge: allow React UI to trigger the file picker
window.openImageFilePicker = function() {
    isImageToolActive = true;
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = IMAGE_ACCEPT_ATTR;
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    let fileSelected = false;

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            fileSelected = true;
            handleImageUpload(file);
        }
        document.body.removeChild(fileInput);
    });

    // Detect cancel: when focus returns to window without a file being selected
    const onFocus = () => {
        window.removeEventListener('focus', onFocus);
        // Delay to let 'change' fire first if a file was selected
        setTimeout(() => {
            if (!fileSelected) {
                // User cancelled — switch back to select tool
                isImageToolActive = false;
                if (window.__sketchEngine?.setActiveTool) {
                    window.__sketchEngine.setActiveTool('select');
                }
                if (fileInput.parentNode) {
                    document.body.removeChild(fileInput);
                }
            }
        }, 300);
    };
    window.addEventListener('focus', onFocus);

    fileInput.click();
};

export { handleMouseDownImage, handleMouseMoveImage, handleMouseUpImage };
