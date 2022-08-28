// aeon: an enhanced reimplementation of the CollabVM server
// Copyright (C) 2022 dither
// SPDX-License-Identifier: AGPL-3.0-only

import { EventEmitter } from "events";

import type { Canvas, Image } from "canvas";

import { Logger } from "../logger";

export interface FramebufferData {
    width: number;
    height: number;
    data: Uint8ClampedArray;
}

export abstract class ProtocolAdapter extends EventEmitter {

    protected readonly logger: Logger;

    constructor(name: string) {
        super();
        this.logger = new Logger("protocol");
    }

    abstract connect(): void;
    abstract disconnect(): void;

    abstract setMouse(x: number, y: number, buttons: number): void;
    abstract setKey(keycode: number, pushed: boolean): void;

    abstract getFrameBuffer(): FramebufferData;
    // XXX: kinda sucks
    abstract getFrameBufferImage(): Canvas | Image;

    onResize(handler: (width: number, height: number) => void) {
        this.on("resize", handler);
    }
    onRect(handler: (x: number, y: number, fb: FramebufferData) => void) {
        this.on("rect", handler);
    }
    onSync(handler: () => void) {
        this.on("sync", handler);
    }
    onCursor(handler: (hx: number, hy:number, fb: FramebufferData) => void) {
        this.on("cursor", handler);
    }

}