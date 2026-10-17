/* eslint-disable */

// Tool pointer coordinates are already in SVG viewBox space. getCTM() also
// includes viewport pan/zoom, so controls use these helpers for shape-only
// translation and rotation.
export function localToCanvas(point, transform) {
    const rotation = (Number(transform.rotation) || 0) * Math.PI / 180;
    const centerX = Number(transform.centerX) || 0;
    const centerY = Number(transform.centerY) || 0;
    const dx = point.x - centerX;
    const dy = point.y - centerY;
    return {
        x: (Number(transform.x) || 0) + centerX + dx * Math.cos(rotation) - dy * Math.sin(rotation),
        y: (Number(transform.y) || 0) + centerY + dx * Math.sin(rotation) + dy * Math.cos(rotation),
    };
}

export function canvasToLocal(point, transform) {
    const rotation = -(Number(transform.rotation) || 0) * Math.PI / 180;
    const centerX = Number(transform.centerX) || 0;
    const centerY = Number(transform.centerY) || 0;
    const dx = point.x - (Number(transform.x) || 0) - centerX;
    const dy = point.y - (Number(transform.y) || 0) - centerY;
    return {
        x: centerX + dx * Math.cos(rotation) - dy * Math.sin(rotation),
        y: centerY + dx * Math.sin(rotation) + dy * Math.cos(rotation),
    };
}
