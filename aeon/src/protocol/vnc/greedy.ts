// aeon: an enhanced reimplementation of the CollabVM server
// Copyright (C) 2022 dither
// SPDX-License-Identifier: AGPL-3.0-only

// the problem:
//  - certain implementations of rfb/vnc are incredibly spammy with updates
//  - qemu in particular is terrible about flooding very small updates quickly
//  - guac tunneling amplifies this problem in both processing and bandwidth
//
// the criteria:
//  - the length of the final set should be <= that of the initial one
//  - final > initial in terms of total area is a valid tradeoff, as less rects
//    still means less processing/network overhead even if the actual area is
//    a bit larger
//
// the solution:
//  1. create a tiled dirty map from the rectangles
//  2. greedily combine the tiles back into tile-quantized rectangles
//  3. dequantize the resulting rectangles

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

// checks if all tiles in a horizontal run of tiles are clean
function scan(map: boolean[], x: number, width: number) {
    width += x;
    for (; x < width; x++) if (!map[x]) return false;
    return true;
}

export function greedy(rects: Rect[], fbw: number, fbh: number, factor = 16): Rect[] {
    // quantize the framebuffer size to a multiple of the tile size
    const qw = Math.ceil(fbw / factor);
    const qh = Math.ceil(fbh / factor);

    // build the tile dirty map
    const tiles: boolean[] = new Array(qw * qh);
    for (const rect of rects) {
        const x = Math.floor(rect.x / factor);
        const y = Math.floor(rect.y / factor);
        const w = Math.ceil(rect.width / factor)
        const h = Math.ceil(rect.height / factor);
        for (var i = 0; i <= h; i++) {
            for (var j = 0; j <= w; j++) {
                const bi = (y + i) * qw + x + j;
                tiles[bi] = true;
            }
        }
    }

    // crawl the map and combine tiles into rects
    // conceptually a variant of a greedy meshing algorithm
    const qrects: Rect[] = [];
    // runs map, used to skip tiles already belonging to a rect
    const runs: number[] = new Array(qw * qh);
    // 1. search for dirty tiles
    for (var y = 0; y < qh; y++) {
        const base = y * qw;
        for (var x = 0; x < qw; x++) {
            // skip clean tiles
            if (!tiles[base + x]) continue;
            // skip if we've already found a rect here
            const run = runs[base + x];
            if (run != null) { x += run - 1; continue; }

            // 2. we've found a relevant dirty tile
            // let's find the rect width
            // crawl to the right until we hit a clean tile
            const x1 = x;
            for (; x < qw && tiles[base + x]; x++);
            const width = x - x1;

            // 3. we now know the width of the rect
            // now find the rect height
            // crawl downward until we hit a clean tile
            //
            // record the rect width at (x1,y1+h) in the runs map as we crawl
            // step 1 can use this data to skip over known tiles
            const scanbase = base + x1;
            runs[scanbase] = width;
            var height = 0;
            while (scan(tiles, scanbase + ++height * qw, width)) runs[scanbase + height * qw] = width;

            // 4. finally, store the rectangle and return to step 1
            qrects.push({ x: x1, y, width, height });
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