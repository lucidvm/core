import VNCClient from "./vncclient.js";

import { ProtocolAdapter } from "../base";

const FPS = 60;

export class VNCAdapter extends ProtocolAdapter {

    protected vnc: VNCClient;
    protected vncInfo: {
        host: string;
        port: number;
        password: string;
        set8BitColor: boolean;
    };

    private stayconnected = false;

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
                //VNCClient.consts.encodings.pseudoCursor
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
            this.emit("rect", 0, 0, this.getFrameBuffer());
            this.emit("sync");
        });
        
        this.vnc.on("desktopSizeChanged", ({width, height}) => {
            this.emit("resize", width, height);
        });
        this.vnc.on("frameUpdated", (fb, rectinfo) => {
            for (const rect of rectinfo) {
                const data = this.vnc.canvasdraw.getImageData(rect.x, rect.y, rect.width, rect.height);
                this.emit("rect", rect.x, rect.y, data);
            }
            this.emit("sync");
        });
        this.vnc.on("cursorChanged", cursor => {
            this.emit("cursor", cursor.x, cursor.y, {
                width: cursor.width,
                height: cursor.height,
                data: new Uint8ClampedArray(cursor.cursorPixels)
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
        return this.vnc.canvasdraw.getImageData(0, 0, this.vnc.clientWidth, this.vnc.clientHeight);
    }

    override getFrameBufferImage() {
        return this.vnc.canvas;
    }

    override setMouse(x: number, y: number, mask: number) {
        this.vnc.sendPointerEvent(x, y, mask);
    }

    override setKey(k: number, o: boolean) {
        this.vnc.sendKeyEvent(k, o);
    }

}