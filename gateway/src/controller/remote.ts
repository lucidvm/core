import { URL } from "url";

import { Canvas, CanvasRenderingContext2D } from "canvas";
import jpg from "@julusian/jpeg-turbo";

import { Codebooks } from "@lucidvm/shared";
import { ensureBoolean, ensureNumber, ensureString, wireprim, LECClient } from "@lucidvm/conduit";

import type { EventGateway } from "../core";

import { BaseMachine } from "./machine";
import { ProtocolAdapter, VNCAdapter } from "../protocol";

export class RemoteMachine extends BaseMachine {

    private lec: LECClient = new LECClient(Codebooks.MonitorGateway);
    private adapter: ProtocolAdapter;

    private thumbcanvas: Canvas;
    private thumbdraw: CanvasRenderingContext2D;

    constructor(
        gw: EventGateway, chan: string,
        monitor: string
    ) {
        super(gw, chan);

        this.lec.on("open", () => {
            this.lec.send("connect", chan);
        });
        this.lec.on("event", (op: string, ...args: wireprim[]) => {
            switch (op) {
                case "ping":
                    this.lec.send("ping");
                    break;
                case "cap":
                    // TODO
                    break;
                case "tunnel":
                    switch (ensureString(args[0])) {
                        case "vnc":
                            console.log("got vnc details from monitor");
                            const url = new URL(ensureString(args[1]));
                            this.setAdapter(new VNCAdapter(url.hostname, +url.port,
                                url.hash.length > 1 ? url.hash.substring(1) : null));
                            break;
                        case "inband":
                            // TODO
                            break;
                    }
                    break;
                case "connect":
                    if (ensureBoolean(args[0])) {
                        // an error occurred
                        console.error("monitor rejected connect request");
                        return;
                    }
                    break;
            }
        });
        this.lec.connect(monitor);
    }

    protected setAdapter(adapter: ProtocolAdapter) {
        if (this.adapter != null) {
            this.adapter.disconnect();
        }

        adapter.onResize((w, h) => {
            const nh = (400 * h) / w;
            this.thumbcanvas = new Canvas(400, nh);
            this.thumbdraw = this.thumbcanvas.getContext("2d");
            this.resize(w, h);
        });
        adapter.onRect((x, y, fb) => {
            const encoded = jpg.compressSync(Buffer.from(fb.data), {
                format: jpg.FORMAT_RGBA,
                width: fb.width,
                height: fb.height,
                quality: 65
            });
            this.rect(x, y, encoded);
        });
        adapter.onSync(() => this.sync());
        adapter.onCursor((x, y, fb) => this.setCursor(x, y, fb.width, fb.height, fb.data));
        this.adapter = adapter;

        if (this.adapter != null) {
            this.adapter.connect();
        }
    }

    override getThumbnail(): Buffer {
        const nh = (400 * this.thumbcanvas.height) / this.thumbcanvas.width;
        const img = this.adapter.getFrameBufferImage();
        this.thumbdraw.drawImage(img, 0, 0, img.width, img.height, 0, 0, 400, nh);
        return jpg.compressSync(Buffer.from(this.thumbdraw.getImageData(0, 0, 400, nh).data), {
            format: jpg.FORMAT_RGBA,
            width: 400,
            height: nh
        });
    }

    override getFrameBuffer(): Buffer {
        const fb = this.adapter.getFrameBuffer();
        return jpg.compressSync(Buffer.from(fb.data), {
            format: jpg.FORMAT_RGBA,
            width: fb.width,
            height: fb.height
        });
    }

    protected override doReset() {
        this.lec.send("reset");
    }

    protected override async pushFile(name: string, data: Buffer, autorun: boolean) {
        this.lec.send("file", name, data, autorun);
    }

    protected override setMouse(x: number, y: number, buttons: number) {
        this.adapter.setMouse(x, y, buttons);
    }

    protected override setKey(keycode: number, on: boolean) {
        this.adapter.setKey(keycode, on);
    }

}