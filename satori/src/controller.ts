import { EventEmitter } from "events";

import { RefObject } from "react";

import { CVMPClient, CVMPFramebuffer } from "./client";

function getLocalServer() {
    return (location.protocol === "https:" ? "wss:" : "ws:") + location.host;
}

export class Controller extends EventEmitter {

    private client: CVMPClient = new CVMPClient();
    private fb: CVMPFramebuffer = new CVMPFramebuffer();

    private canvas: RefObject<HTMLCanvasElement>;

    constructor() {
        super();
        this.client.on("size", (l, w, h) => this.fb.resize(l, w, h));
        this.client.on("move", (l, p, x, y, z) => this.fb.move(l, x, y));
        this.client.on("rect", (l, x, y, c, d) => this.fb.rect(l, x, y, c, d));
        this.client.on("sync", async () => {
            const sync = await this.fb.sync();
            const draw = this.canvas.current?.getContext("2d");
            draw?.drawImage(sync as any as HTMLCanvasElement, 0, 0,
                this.canvas.current.width, this.canvas.current.height);
        });
    }

    setCanvas(canvas: RefObject<HTMLCanvasElement>) {
        this.canvas = canvas;
    }
    clearCanvas() { this.setCanvas(null); }

    async connect(room: string, server = getLocalServer()) {
        if (this.client.active) {
            this.client.close();
        }
        this.client.open(server);
        this.client.once("ready", async () => {
            await this.client.join(room);
        });
    }

}