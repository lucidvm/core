import { EventEmitter } from "events";

import { WebSocket } from "ws";

import type { wireprim } from "../types";
import type { EventConduit } from "../base";

import { LECConduit } from "./index";

export class LECClient extends EventEmitter {

    private ws: WebSocket;

    readonly conduit: EventConduit;

    private closing = false;

    constructor(codebook: string[] = []) {
        super();
        this.conduit = new LECConduit(codebook);
    }

    connect(path: string) {
        this.ws = new WebSocket(path);
        this.ws.on("open", () => {
            this.emit("open");
        });
        this.ws.on("close", () => {
            if (!this.closing) {
                this.connect(path);
            }
        });
        this.ws.on("error", () => {
            if (!this.closing) {
                this.connect(path);
            }
        });
        this.ws.on("message", x => {
            const stmts = this.conduit.unpack(x);
            this.emit("event", ...stmts[0]);
        });
    }

    send(...args: wireprim[]) {
        if (this.ws.readyState !== WebSocket.OPEN) {
            return;
        }
        this.ws.send(this.conduit.pack(...args));
    }

}