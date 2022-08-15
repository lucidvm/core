import { Canvas } from "canvas";
import jpg from "@julusian/jpeg-turbo";

import VNCClient from "./vncclient.js";

import type { EventGateway } from "../../core";

import { BaseMachine } from "../machine";

const FPS = 60;

export class VNCMachine extends BaseMachine {

    protected vnc: VNCClient;
    protected vncInfo: {
        host: string;
        port: number;
        password: string;
        set8BitColor: boolean;
    };

    constructor(gw: EventGateway, chan: string,
            host = "127.0.0.1", port = 5900, password: string = null,
            pseudocursor = true, connectnow = true) {
        super(gw, chan);

        this.vncInfo = { host, port, password, set8BitColor: false };
        this.vnc = new VNCClient({
            debug: false,
            fps: FPS,
            encodings: [
                VNCClient.consts.encodings.copyRect,
                VNCClient.consts.encodings.zrle,
                //VNCClient.consts.encodings.hextile,
                VNCClient.consts.encodings.raw,

                VNCClient.consts.encodings.pseudoDesktopSize
            ]
        });
        if (pseudocursor) {
            this.vnc.encodings.push(VNCClient.consts.encodings.pseudoCursor);
        }

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
            if (this.options.displayName == null) {
                this.options.displayName = this.vnc.clientName;
            }
            // workaround
            this.vnc.changeFps(FPS);
            this.resize(this.vnc.clientWidth, this.vnc.clientHeight);
            this.rect(0, 0, this.getFrameBuffer());
            this.sync();
        });
        
        this.vnc.on("desktopSizeChanged", ({width, height}) => {
            this.resize(width, height);
        });
        this.vnc.on("frameUpdated", (fb, rectinfo) => {
            for (const rect of rectinfo) {
                if (rect.encoding === 1) {
                    this.copy(rect.x, rect.y, rect.width, rect.height, rect.dx, rect.dy);
                }
                else {
                    const data = this.vnc.canvasdraw.getImageData(rect.x, rect.y, rect.width, rect.height);
                    const encoded = jpg.compressSync(Buffer.from(data.data), {
                        format: jpg.FORMAT_RGBA,
                        width: data.width,
                        height: data.height,
                        quality: 65
                    });
                    this.rect(rect.x, rect.y, encoded);
                }
            }
            this.sync();
        });
        this.vnc.on("cursorChanged", cursor => {
            this.setCursor(cursor.x, cursor.y, cursor.width, cursor.height,
                new Uint8ClampedArray(cursor.cursorPixels));
        });

        if (connectnow) {
            this.vncReconnect();
        }
    }

    protected vncReconnect() {
        if (this.vnc.connected) return;
        this.vnc.connect(this.vncInfo);
    }

    override getThumbnail(): Buffer {
        // FIXME: only recreate the thumbnail canvas on client resize
        const w = this.vnc.clientWidth;
        const h = this.vnc.clientHeight;
        const nh = (400 * h) / w;
        const canvas = new Canvas(400, nh);
        const draw = canvas.getContext("2d");
        draw.drawImage(this.vnc.canvas, 0, 0, w, h, 0, 0, 400, nh);
        return jpg.compressSync(Buffer.from(draw.getImageData(0, 0, 400, nh).data), {
            format: jpg.FORMAT_RGBA,
            width: 400,
            height: nh
        });
    }

    override getFrameBuffer(): Buffer {
        return jpg.compressSync(Buffer.from(this.vnc.canvasdraw.getImageData(0, 0, this.vnc.clientWidth, this.vnc.clientHeight).data), {
            format: jpg.FORMAT_RGBA,
            width: this.vnc.clientWidth,
            height: this.vnc.clientHeight
        });
    }

    protected override setMouse(x: number, y: number, mask: number) {
        this.vnc.sendPointerEvent(x, y, mask);
    }

    protected override setKey(k: number, o: boolean) {
        this.vnc.sendKeyEvent(k, o);
    }

}