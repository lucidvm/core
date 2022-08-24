import crypto from "crypto";

import { Canvas, CanvasRenderingContext2D } from "canvas";
import jpg from "@julusian/jpeg-turbo";

import { QEMUMonitor, QEMUOptions } from "@lucidvm/virtue";

import type { EventGateway } from "../core";

import { BaseMachine } from "./machine";
import { VNCAdapter } from "../protocol";

const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export class LocalMachine extends BaseMachine {

    private readonly vnc: VNCAdapter;
    readonly monitor: QEMUMonitor;

    private thumbcanvas: Canvas;
    private thumbdraw: CanvasRenderingContext2D;

    constructor(
        gw: EventGateway, chan: string,
        index: number, opts: QEMUOptions
    ) {
        super(gw, chan);

        opts.vncpw = [...crypto.randomBytes(8)].map(x => charset[x % charset.length]).join("");

        this.monitor = new QEMUMonitor(index, opts);

        this.vnc = new VNCAdapter("127.0.0.1", this.monitor.vncport, opts.vncpw);
        this.vnc.onResize((w, h) => {
            const nh = (400 * h) / w;
            this.thumbcanvas = new Canvas(400, nh);
            this.thumbdraw = this.thumbcanvas.getContext("2d");
            this.resize(w, h);
        });
        this.vnc.onRect((x, y, fb) => {
            const encoded = jpg.compressSync(Buffer.from(fb.data), {
                format: jpg.FORMAT_RGBA,
                width: fb.width,
                height: fb.height,
                quality: 65
            });
            this.rect(x, y, encoded);
        });
        this.vnc.onSync(() => this.sync());
        this.vnc.onCursor((x, y, fb) => this.setCursor(x, y, fb.width, fb.height, fb.data));

        this.monitor.once("connected", () => {
            this.vnc.connect();
        });

        this.monitor.start();
    }

    protected override destroyImpl(): void | Promise<void> {
        this.vnc.disconnect();
        this.monitor.stop();
    }

    override getThumbnail(): Buffer {
        const nh = (400 * this.thumbcanvas.height) / this.thumbcanvas.width;
        const img = this.vnc.getFrameBufferImage();
        this.thumbdraw.drawImage(img, 0, 0, img.width, img.height, 0, 0, 400, nh);
        return jpg.compressSync(Buffer.from(this.thumbdraw.getImageData(0, 0, 400, nh).data), {
            format: jpg.FORMAT_RGBA,
            width: 400,
            height: nh
        });
    }

    override getFrameBuffer(): Buffer {
        const fb = this.vnc.getFrameBuffer();
        return jpg.compressSync(Buffer.from(fb.data), {
            format: jpg.FORMAT_RGBA,
            width: fb.width,
            height: fb.height
        });
    }

    protected override doReset() {
        this.monitor.reset();
    }

    protected override async pushFile(name: string, data: Buffer, autorun: boolean) {
        // TODO
    }

    protected override setMouse(x: number, y: number, buttons: number) {
        this.vnc.setMouse(x, y, buttons);
    }

    protected override setKey(keycode: number, on: boolean) {
        this.vnc.setKey(keycode, on);
    }

}