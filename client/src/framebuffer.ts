import { EventEmitter } from "events";

import { Canvas, loadImage } from "canvas";

interface QueuedUpdate {
    layer: number;
    x: number;
    y: number;
    op: GlobalCompositeOperation;
    data: Buffer;
}

// very minimal implementation of Guacamole display stuff
export class CVMPFramebuffer extends EventEmitter {

    // layer 0 buffer
    protected display = new Canvas(800, 600);
    protected dispCtx = this.display.getContext("2d");
    // layer 1 buffer
    protected overlay = new Canvas(800, 600);
    protected overCtx = this.overlay.getContext("2d");
    private ox = 0;
    private oy = 0;
    // composition work buffer
    protected compose = new Canvas(800, 600);
    protected compCtx = this.compose.getContext("2d");

    // rect queue
    private rectq: QueuedUpdate[] = [];

    constructor() {
        super();
    }

    // resize layer
    resize(layer: number, width: number, height: number) {
        switch (layer) {
            case 0:
                this.display.width = width;
                this.display.height = height;
                this.compose.width = width;
                this.compose.height = height;
                break;
            case 1:
                this.overlay.width = width;
                this.overlay.height = height;
                break;
        }
    }

    // queue a rect update
    rect(layer: number, x: number, y: number,
        op: GlobalCompositeOperation, data: Buffer) {
        this.rectq.push({ layer, x, y, op, data });
    }

    // move overlay to position
    // always assumes layer 0 as parent and does not support z
    move(layer: number, x: number, y: number) {
        switch (layer) {
            case 1:
                this.ox = x;
                this.oy = y;
                break;
        }
    }

    // actually render the frame
    async sync(): Promise<Canvas> {
        // draw rect updates to layers
        for (const { layer, x, y, op, data } of this.rectq) {
            // XXX: naively assumes layer != 0 means layer == 1
            //      hardly matters for CollabVM and LucidVM, but of note
            const ctx = layer === 0 ? this.dispCtx : this.overCtx;
            ctx.globalCompositeOperation = op;

            // load the image and draw it
            // this has to be done differently depending on the platform
            if (typeof createImageBitmap === "undefined") {
                // probably nodejs, so try loadImage
                // XXX: WHY IS THIS A UINT8ARRAY AND NOT A BUFFER AT THIS POINT???
                const img = await loadImage(Buffer.from(data));
                ctx.drawImage(img, x, y);
            }
            else {
                const img = await createImageBitmap(new Blob([data]) as ImageBitmapSource);
                ctx.drawImage(img, x, y);
            }
        }
        // clear queue for next batch
        this.rectq = [];

        // copy display buffer to final buffer
        this.compCtx.globalCompositeOperation = "copy";
        this.compCtx.drawImage(this.display, 0, 0);

        // compose overlay layer atop at specified position
        this.compCtx.globalCompositeOperation = "source-over";
        this.compCtx.drawImage(this.overlay, this.ox, this.oy);

        return this.compose;
    }

}