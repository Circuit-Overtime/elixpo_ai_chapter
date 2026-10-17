const MIN_SHAPE_SIZE = 8;

export const MAX_GESTURE_POINTS = 96;

export function distance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
}

function orientedBounds(sample, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const point of sample) {
        const u = point.x * cos + point.y * sin;
        const v = -point.x * sin + point.y * cos;
        minU = Math.min(minU, u);
        maxU = Math.max(maxU, u);
        minV = Math.min(minV, v);
        maxV = Math.max(maxV, v);
    }
    const centerU = (minU + maxU) / 2;
    const centerV = (minV + maxV) / 2;
    return {
        center: {
            x: centerU * cos - centerV * sin,
            y: centerU * sin + centerV * cos,
        },
        width: Math.max(MIN_SHAPE_SIZE, maxU - minU),
        height: Math.max(MIN_SHAPE_SIZE, maxV - minV),
        angle,
        minU,
        maxU,
        minV,
        maxV,
    };
}

function principalAngle(sample) {
    let meanX = 0;
    let meanY = 0;
    for (const point of sample) {
        meanX += point.x;
        meanY += point.y;
    }
    meanX /= sample.length;
    meanY /= sample.length;
    let xx = 0;
    let yy = 0;
    let xy = 0;
    for (const point of sample) {
        const dx = point.x - meanX;
        const dy = point.y - meanY;
        xx += dx * dx;
        yy += dy * dy;
        xy += dx * dy;
    }
    if (Math.abs(xx - yy) + Math.abs(xy) < 0.001) return 0;
    return Math.atan2(2 * xy, xx - yy) / 2;
}

function rectangleAngle(sample) {
    let x = 0;
    let y = 0;
    for (let index = 1; index < sample.length; index += 1) {
        const dx = sample[index].x - sample[index - 1].x;
        const dy = sample[index].y - sample[index - 1].y;
        const length = Math.hypot(dx, dy);
        if (length === 0) continue;
        const angle = Math.atan2(dy, dx) * 4;
        x += Math.cos(angle) * length;
        y += Math.sin(angle) * length;
    }
    return Math.atan2(y, x) / 4;
}

function pointToSegmentDistance(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return distance(point, start);
    const amount = Math.max(0, Math.min(1,
        ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
    return Math.hypot(point.x - (start.x + dx * amount), point.y - (start.y + dy * amount));
}

function polygonError(sample, vertices, scale) {
    let total = 0;
    for (const point of sample) {
        let nearest = Infinity;
        for (let index = 0; index < vertices.length; index += 1) {
            nearest = Math.min(nearest, pointToSegmentDistance(
                point,
                vertices[index],
                vertices[(index + 1) % vertices.length],
            ));
        }
        total += nearest;
    }
    return total / sample.length / Math.max(scale, MIN_SHAPE_SIZE);
}

function polygonVertices(bounds, kind) {
    const cos = Math.cos(bounds.angle);
    const sin = Math.sin(bounds.angle);
    const toWorld = (u, v) => ({
        x: u * cos - v * sin,
        y: u * sin + v * cos,
    });
    const centerU = (bounds.minU + bounds.maxU) / 2;
    const centerV = (bounds.minV + bounds.maxV) / 2;
    const local = kind === 'triangle'
        ? [[centerU, bounds.minV], [bounds.maxU, bounds.maxV], [bounds.minU, bounds.maxV]]
        : kind === 'diamond'
            ? [[centerU, bounds.minV], [bounds.maxU, centerV], [centerU, bounds.maxV], [bounds.minU, centerV]]
            : [[bounds.minU, bounds.minV], [bounds.maxU, bounds.minV], [bounds.maxU, bounds.maxV], [bounds.minU, bounds.maxV]];
    return local.map(([u, v]) => toWorld(u, v));
}

function trianglePrediction(sample, pathLength) {
    const baseAngle = principalAngle(sample);
    let best = null;
    // Principal axes do not encode direction. Testing four quarter turns keeps
    // the fit rotation-independent while retaining a constant number of O(N)
    // passes over the capped gesture sample.
    for (let turn = 0; turn < 4; turn += 1) {
        const bounds = orientedBounds(sample, baseAngle + turn * Math.PI / 2);
        const vertices = polygonVertices(bounds, 'triangle');
        const error = polygonError(sample, vertices, Math.hypot(bounds.width, bounds.height));
        if (!best || error < best.error) best = { bounds, vertices, error };
    }
    if (!best || best.error > 0.045) return null;
    return {
        type: 'triangle',
        ...best.bounds,
        vertices: best.vertices,
        pathLength,
    };
}

function diamondPrediction(sample, pathLength) {
    const bounds = orientedBounds(sample, principalAngle(sample));
    const vertices = polygonVertices(bounds, 'diamond');
    const error = polygonError(sample, vertices, Math.hypot(bounds.width, bounds.height));
    if (error > 0.035) return null;
    return { type: 'diamond', ...bounds, vertices, pathLength };
}

function closedShapePrediction(sample, pathLength) {
    const triangle = trianglePrediction(sample, pathLength);
    if (triangle) return triangle;
    const fittedDiamond = diamondPrediction(sample, pathLength);
    if (fittedDiamond) return fittedDiamond;
    const rectBounds = orientedBounds(sample, rectangleAngle(sample));
    const ellipseBounds = orientedBounds(sample, principalAngle(sample));
    let rectangleError = 0;
    let ellipseError = 0;
    const rectCos = Math.cos(rectBounds.angle);
    const rectSin = Math.sin(rectBounds.angle);
    const ellipseCos = Math.cos(ellipseBounds.angle);
    const ellipseSin = Math.sin(ellipseBounds.angle);
    const rectHalfW = rectBounds.width / 2;
    const rectHalfH = rectBounds.height / 2;
    const ellipseHalfW = ellipseBounds.width / 2;
    const ellipseHalfH = ellipseBounds.height / 2;

    for (const point of sample) {
        const rectDx = point.x - rectBounds.center.x;
        const rectDy = point.y - rectBounds.center.y;
        const rectU = Math.abs(rectDx * rectCos + rectDy * rectSin) / rectHalfW;
        const rectV = Math.abs(-rectDx * rectSin + rectDy * rectCos) / rectHalfH;
        rectangleError += Math.min(Math.abs(1 - rectU), Math.abs(1 - rectV));
        const ellipseDx = point.x - ellipseBounds.center.x;
        const ellipseDy = point.y - ellipseBounds.center.y;
        const ellipseU = (ellipseDx * ellipseCos + ellipseDy * ellipseSin) / ellipseHalfW;
        const ellipseV = (-ellipseDx * ellipseSin + ellipseDy * ellipseCos) / ellipseHalfH;
        ellipseError += Math.abs(1 - Math.hypot(ellipseU, ellipseV));
    }

    rectangleError /= sample.length;
    ellipseError /= sample.length;
    const rectangle = rectangleError <= ellipseError * 1.08;
    const bestError = rectangle ? rectangleError : ellipseError;
    if (bestError > 0.24) {
        return { type: 'freehand', points: sample.map((point) => ({ ...point })), pathLength };
    }
    const bounds = rectangle ? rectBounds : ellipseBounds;
    const normalizedAngle = Math.abs(Math.atan2(Math.sin(rectBounds.angle * 2), Math.cos(rectBounds.angle * 2)) / 2);
    const diamond = rectangle && normalizedAngle >= Math.PI / 7;
    return {
        type: diamond ? 'diamond' : (rectangle ? 'rectangle' : 'circle'),
        ...bounds,
        ...(diamond ? { vertices: polygonVertices(rectBounds, 'rectangle') } : {}),
        pathLength,
    };
}

export function capGestureSample(sample, maxPoints = MAX_GESTURE_POINTS) {
    if (!Array.isArray(sample) || sample.length <= maxPoints) return Array.isArray(sample) ? sample : [];
    if (maxPoints <= 1) return sample.slice(0, Math.max(0, maxPoints));
    const capped = [sample[0]];
    const step = (sample.length - 1) / (maxPoints - 1);
    for (let index = 1; index < maxPoints - 1; index += 1) {
        capped.push(sample[Math.round(index * step)]);
    }
    capped.push(sample[sample.length - 1]);
    return capped;
}

export function predictDrawnShape(input) {
    const sample = capGestureSample(input);
    if (sample.length < 2) return null;
    const start = sample[0];
    let pathLength = 0;
    let farthestIndex = 1;
    let farthestDistance = 0;
    let minX = start.x;
    let maxX = start.x;
    let minY = start.y;
    let maxY = start.y;

    for (let index = 1; index < sample.length; index += 1) {
        pathLength += distance(sample[index - 1], sample[index]);
        const fromStart = distance(start, sample[index]);
        if (fromStart > farthestDistance) {
            farthestDistance = fromStart;
            farthestIndex = index;
        }
        minX = Math.min(minX, sample[index].x);
        maxX = Math.max(maxX, sample[index].x);
        minY = Math.min(minY, sample[index].y);
        maxY = Math.max(maxY, sample[index].y);
    }

    const diagonal = Math.max(MIN_SHAPE_SIZE, Math.hypot(maxX - minX, maxY - minY));
    const end = sample[sample.length - 1];
    const closed = sample.length >= 8 && distance(start, end) <= diagonal * 0.28 && pathLength >= diagonal * 1.85;
    if (closed) return closedShapePrediction(sample, pathLength);

    const tip = sample[farthestIndex];
    let afterTipLength = 0;
    for (let index = farthestIndex + 1; index < sample.length; index += 1) {
        afterTipLength += distance(sample[index - 1], sample[index]);
    }
    let shaftLength = 0;
    for (let index = 1; index <= farthestIndex; index += 1) {
        shaftLength += distance(sample[index - 1], sample[index]);
    }
    const arrow = farthestIndex >= Math.floor(sample.length * 0.45)
        && farthestIndex < sample.length - 2
        && afterTipLength >= diagonal * 0.18
        && distance(end, tip) <= diagonal * 0.48
        && farthestDistance / Math.max(shaftLength, 1) >= 0.86;
    const directDistance = distance(start, end);
    const line = !arrow && directDistance / Math.max(pathLength, 1) >= 0.92;

    if (!arrow && !line) {
        return { type: 'freehand', points: sample.map((point) => ({ ...point })), pathLength };
    }
    return {
        type: arrow ? 'arrow' : 'line',
        start: { ...start },
        end: arrow ? { ...tip } : { ...end },
        width: Math.max(MIN_SHAPE_SIZE, maxX - minX),
        height: Math.max(MIN_SHAPE_SIZE, maxY - minY),
        pathLength,
    };
}
