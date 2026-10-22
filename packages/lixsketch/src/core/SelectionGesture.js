/* eslint-disable */

function normalizePointerId(pointerId) {
    return Number.isFinite(Number(pointerId)) ? Number(pointerId) : null;
}

export function createSelectionGestureOwner() {
    let activeGesture = null;

    return {
        captureShape(shape, pointerId) {
            if (!shape) return null;
            activeGesture = {
                kind: 'shape',
                shape,
                shapeName: shape.shapeName,
                pointerId: normalizePointerId(pointerId),
            };
            return activeGesture;
        },

        captureMulti(pointerId) {
            activeGesture = {
                kind: 'multi',
                pointerId: normalizePointerId(pointerId),
            };
            return activeGesture;
        },

        get(pointerId) {
            if (!activeGesture) return null;
            const requestedPointer = normalizePointerId(pointerId);
            if (activeGesture.pointerId !== null && requestedPointer !== null && activeGesture.pointerId !== requestedPointer) {
                return null;
            }
            return activeGesture;
        },

        clear(pointerId) {
            const gesture = this.get(pointerId);
            if (!gesture) return false;
            activeGesture = null;
            return true;
        },

        clearAll() {
            activeGesture = null;
        },
    };
}
