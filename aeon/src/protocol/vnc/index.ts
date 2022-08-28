// aeon: an enhanced reimplementation of the CollabVM server
// Copyright (C) 2022 dither
// SPDX-License-Identifier: AGPL-3.0-only

import { Canvas, createImageData } from "canvas";

import VNCClient from "@lucidvm/rfb";

import { ProtocolAdapter } from "../base";

import { Rect, greedy } from "./greedy";

const FPS = 60;

export class VNCAdapter extends ProtocolAdapter {

    private canvas: Canvas = new Canvas(800, 600);
    private draw = this.canvas.getContext("2d");

    protected vnc: VNCClient;
    protected vncInfo: {
        host: string;
        port: number;
        password: string;
        set8BitColor: boolean;
    };

    private stayconnected = false;
    private lastcursor: Buffer = null;

    constructor(host = "127.0.0.1", port = 5900, password: string = null) {
        super();

        this.vncInfo = { host, port, password, set8BitColor: false };
        this.vnc = new VNCClient({
            debug: false,
            fps: FPS,
            encodings: [
                //VNCClient.consts.encodings.copyRect,
                //VNCClient.consts.encodings.zrle,
                //VNCClient.consts.encodings.hextile,
                VNCClient.consts.encodings.raw,

                VNCClient.consts.encodings.pseudoDesktopSize,
                VNCClient.consts.encodings.pseudoCursor
            ]
        });

        this.vnc.on("connectTimeout", () => {
            console.warn("vnc timeout");
            this.vncReconnect();
        });
        this.vnc.on("authError", () => {
            console.error("vnc auth error");
            this.vncReconnect();
        });
        this.vnc.on("disconnect", () => {
            console.warn("vnc disconnect");
            this.vncReconnect();
        });
        this.vnc.on("closed", () => {
            console.warn("vnc disconnect");
            this.vncReconnect();
        });

        this.vnc.on("firstFrameUpdate", () => {
            // workaround
            this.vnc.changeFps(FPS);
            this.emit("resize", this.vnc.clientWidth, this.vnc.clientHeight);
            this.canvas.width = this.vnc.clientWidth;
            this.canvas.height = this.vnc.clientHeight;
            this.emit("rect", 0, 0, this.getFrameBuffer());
            this.emit("sync");
        });

        this.vnc.on("desktopSizeChanged", ({ width, height }) => {
            this.emit("resize", width, height);
            this.canvas.width = width;
            this.canvas.height = height;
        });

        var rects: Rect[] = [];
        this.vnc.on("rectUpdateProcessed", (rect: Rect) => {
            rects.push(rect);
        });
        this.vnc.on("frameUpdated", fb => {
            // blit framebuffer to canvas so we can actually use it
            const imgdata = createImageData(new Uint8ClampedArray(fb.buffer), this.vnc.clientWidth, this.vnc.clientHeight);
            this.draw.putImageData(imgdata, 0, 0);

            // optimize the rects
            rects = greedy(rects, this.vnc.clientWidth, this.vnc.clientHeight);

            // extract rect data and emit
            for (const rect of rects) {
                const data = this.draw.getImageData(rect.x, rect.y, rect.width, rect.height);
                this.emit("rect", rect.x, rect.y, data);
            }

            // clear rect array
            rects = [];
            
            // emit sync
            this.emit("sync");
        });

        this.vnc.on("cursorChanged", cursor => {
            // avoid notifying the consumer of a duplicate cursor
            if (this.lastcursor != null && this.lastcursor.compare(cursor.data) === 0) {
                return;
            }
            this.lastcursor = cursor.data;
            this.emit("cursor", cursor.x, cursor.y, {
                width: cursor.width,
                height: cursor.height,
                data: new Uint8ClampedArray(cursor.data.buffer)
            });
        });
    }

    protected vncReconnect() {
        if (!this.stayconnected) return;
        if (this.vnc.connected) return;
        this.vnc.connect(this.vncInfo);
    }

    override connect() {
        this.stayconnected = true;
        this.vncReconnect();
    }

    override disconnect() {
        this.stayconnected = false;
        this.vnc.disconnect();
    }

    override getFrameBuffer() {
        return this.draw.getImageData(0, 0, this.vnc.clientWidth, this.vnc.clientHeight);
    }

    override getFrameBufferImage() {
        return this.canvas;
    }

    override setMouse(x: number, y: number, mask: number) {
        this.vnc.sendPointerEventRaw(x, y, mask);
    }

    override setKey(k: number, o: boolean) {
        this.vnc.sendKeyEvent(k, o);
    }

}