/* eslint-disable */

import { Frame } from '../shapes/Frame.js';
import { pushCreateAction } from '../core/UndoRedo.js';
import { normalizeWebEmbedUrl } from '../core/WebEmbedPolicy.js';

let frame = null, start = null;
function coords(e) {
    const vb = svg.viewBox.baseVal, rect = svg.getBoundingClientRect();
    return { x: vb.x + ((e.clientX - rect.left) / rect.width) * vb.width, y: vb.y + ((e.clientY - rect.top) / rect.height) * vb.height };
}

export function placeWebEmbed(urlValue) {
    const url = normalizeWebEmbedUrl(urlValue);
    if (!url || typeof svg === 'undefined') return null;

    // Complete the tool transition first because setActiveTool clears the
    // previous selection. The newly inserted frame should remain selected.
    window.__sketchStoreApi?.setActiveTool('select');
    const viewBox = svg.viewBox.baseVal;
    const width = Math.min(640, Math.max(320, viewBox.width * 0.56));
    const height = width * 9 / 16;
    const x = viewBox.x + (viewBox.width - width) / 2;
    const y = viewBox.y + (viewBox.height - height) / 2;
    const placedFrame = new Frame(x, y, width, height, {
        frameName: 'Web embed', frameType: 'web-embed', webEmbedURL: url,
        stroke: '#8b76d6', strokeWidth: 2,
    });
    shapes.push(placedFrame);
    pushCreateAction(placedFrame);
    currentShape = placedFrame;
    placedFrame.selectFrame();
    window.__pendingWebEmbedURL = null;
    return placedFrame;
}

export function handleWebEmbedDown(e) {
    const url = normalizeWebEmbedUrl(window.__pendingWebEmbedURL);
    if (!window.isWebEmbedToolActive || !url) { window.__showWebEmbedModal?.(); return; }
    start = coords(e);
    frame = new Frame(start.x, start.y, 0, 0, { frameName: 'Web embed', frameType: 'web-embed', webEmbedURL: url, stroke: '#8b76d6', strokeWidth: 2 });
    shapes.push(frame); currentShape = frame;
}

export function handleWebEmbedMove(e) {
    if (!frame || !start) return;
    const p = coords(e); frame.x = Math.min(start.x, p.x); frame.y = Math.min(start.y, p.y);
    frame.width = Math.abs(p.x - start.x); frame.height = Math.abs(p.y - start.y); frame.draw();
}

export function handleWebEmbedUp() {
    if (!frame) return;
    if (frame.width < 40 || frame.height < 30) { frame.width = 560; frame.height = 315; }
    frame.draw(); pushCreateAction(frame);
    const placedFrame = frame;
    window.__pendingWebEmbedURL = null; frame = null; start = null;
    window.__sketchStoreApi?.setActiveTool('select', { afterDraw: true });
    currentShape = placedFrame; placedFrame.selectFrame();
}

window.__placeWebEmbed = placeWebEmbed;
