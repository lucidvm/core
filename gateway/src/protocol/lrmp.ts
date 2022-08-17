import { Canvas, CanvasRenderingContext2D, loadImage } from "canvas";

import { Codebooks } from "@lucidvm/shared";
import {
    ensureBoolean, ensureBuffer, ensureNumber, ensureString,
    LECClient,
    wireprim
} from "@lucidvm/conduit";

import { ProtocolAdapter } from "./base";

export class LRMPClient extends ProtocolAdapter {

    private canvas: Canvas = new Canvas(640, 480);
    private shadow: CanvasRenderingContext2D = this.canvas.getContext("2d");

    readonly lec: LECClient = new LECClient(Codebooks.MonitorGateway);

    constructor(chan: string) {
        super();

        const lec = this.lec;
        lec.on("open", () => {
            lec.send("connect", chan);
        });
        lec.on("event", async (op: string, ...args: wireprim[]) => {
            switch (op) {
                // core
                case "ping":
                    lec.send("ping");
                    break;
                case "cap":
                    this.emit("caps", args);
                    break;
                case "tunnel":
                    this.emit("tunnel", ensureString(args[0]), args[1]);
                    break;
                case "connect":
                    if (ensureBoolean(args[0])) {
                        // an error occurred
                        this.emit("reject");
                        return;
                    }
                    this.emit("connect");
                    break;
                
                // in-band updates
                case "resize": {
                    const w = ensureNumber(args[0]);
                    const h = ensureNumber(args[1]);
                    this.canvas.width = w;
                    this.canvas.height = h;
                    this.emit("resize", w, h);
                    break;
                }
                case "rect": {
                    const x = ensureNumber(args[0]);
                    const y = ensureNumber(args[1]);
                    const img = await loadImage(ensureBuffer(args[2]));
                    this.shadow.drawImage(img, x, y);
                    this.emit("rect", x, y, this.shadow.getImageData(x, y, img.width, img.height));
                    break;
                }
                case "sync":
                    this.emit("sync");
                    break;
                case "cursor": {
                    this.emit("cursor",
                        ensureNumber(args[0]),
                        ensureNumber(args[1]),
                        {
                            width: ensureNumber(args[2]),
                            height: ensureNumber(args[3]),
                            data: ensureBuffer(args[4])
                        }
                    );
                    break;
                }
            }
        });
    }

    // these are adapter-level, so no-op them
    override connect(): void { }
    override disconnect(): void { }

    override setMouse(x: number, y: number, buttons: number) {
        this.lec.send("mouse", x, y, buttons);
    }

    override setKey(keycode: number, pushed: boolean) {
        this.lec.send("key", keycode, pushed);
    }

    override getFrameBuffer() {
        return this.shadow.getImageData(0, 0, this.canvas.width, this.canvas.height);
    }

    override getFrameBufferImage() {
        return this.canvas;
    }

    doReset() {
        this.lec.send("reset");
    }

    pushFile(name: string, data: Buffer, autorun: boolean) {
        this.lec.send("file", name, data, autorun);
    }

    onCaps(handler: (caps: string[]) => void) {
        this.on("caps", handler);
    }
    onConnect(handler: () => void) {
        this.on("connect", handler);
    }
    onReject(handler: () => void) {
        this.on("reject", handler);
    }
    onTunnel(handler: (protocol: string, details: string) => void) {
        this.on("tunnel", handler);
    }

}