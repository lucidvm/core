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

export function optimize(rects: Rect[], fbw: number, fbh: number, factor = 16): Rect[] {
    // get quantized fb size
    const qw = Math.ceil(fbw / factor);
    const qh = Math.ceil(fbh / factor);

    // build tile mask
    const qmap: boolean[] = new Array(qw * qh);
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
    const rows: number[] = new Array(qw * qh);
    for (var y = 0; y < qh; y++) {
        const base = y * qw;
        for (var x = 0; x < qw; x++) {
            // skip unused tiles
            if (!qmap[base + x]) continue;
            // also skip if we've already found a rect here
            var row = rows[base + x];
            if (row != null) { x += row - 1; continue; }
            // find the chunk width
            const sx = x;
            for (; x < qw && qmap[base + x]; x++);
            const width = x - sx;
            rows[base + sx] = width;
            // find the chunk height
            const bs = base + sx;
            var height = 0;
            while (scan(qmap, bs + ++height * qw, width)) rows[bs + height * qw] = width;
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