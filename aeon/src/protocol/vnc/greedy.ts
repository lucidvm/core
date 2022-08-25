export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

function scan(map: boolean[], x: number, width: number) {
    width += x;
    for (; x < width; x++) if (!map[x]) return false;
    return true;
}

export function optimize(rects: Rect[], width: number, height: number, factor = 16): Rect[] {
    // get quantized fb size
    const qw = Math.ceil(width / factor);
    const qh = Math.ceil(height / factor);

    // build tile mask
    const qmap: boolean[] = [];
    for (const rect of rects) {
        const x = Math.floor(rect.x / factor);
        const y = Math.floor(rect.y / factor);
        const w = Math.ceil(rect.width / factor)
        const h = Math.ceil(rect.height / factor);
        for (var i = 0; i <= h; i++) {
            for (var j = 0; j <= w; j++) {
                const bi = (y + i) * qw + x + j;
                qmap[bi] = true;
            }
        }
    }

    // crawl the mask and combine tiles into chunks
    const qrects: Rect[] = [];
    for (var y = 0; y < qh; y++) {
        const base = y * qw;
        for (var x = 0; x < qw; x++) {
            // skip unused tiles
            if (!qmap[base + x]) continue;
            // also skip if we've already found a rect here
            if (qrects.find(r => r.y <= y && r.y + r.height > y && r.x <= x && r.x + r.width > x) != null) continue;
            // find the chunk width
            const sx = x;
            for (; x < qw && qmap[base + x]; x++);
            const width = x - sx;
            // find the chunk height
            var height = y;
            while (scan(qmap, ++height, width));
            // push the rect
            qrects.push({ x: sx, y, width, height });
        }
    }
    
    // return dequantized rects
    return qrects.map(r => ({
        x: r.x * factor,
        y: r.y * factor,
        width: r.width * factor,
        height: r.height * factor
    }));
}