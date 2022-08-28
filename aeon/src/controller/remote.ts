// aeon: an enhanced reimplementation of the CollabVM server
// Copyright (C) 2022 dither
// SPDX-License-Identifier: AGPL-3.0-only

import { URL } from "url";

import { Canvas, CanvasRenderingContext2D } from "canvas";

import { ensureString } from "@lucidvm/shared";

import type { EventGateway } from "../gateway";

import { BaseMachine } from "./machine";
import { ProtocolAdapter, VNCAdapter, LRMPClient } from "../protocol";

export class RemoteMachine extends BaseMachine {

    private client: LRMPClient;
    private adapter: ProtocolAdapter;

    private thumbcanvas: Canvas;
    private thumbdraw: CanvasRenderingContext2D;

    constructor(
        gw: EventGateway, chan: string,
        monitor: string
    ) {
        super(gw, chan);

        this.client = new LRMPClient(chan);
        this.client.onCaps(caps => {
            // TODO
            this.logger.debug("supported caps", caps);
        });
        this.client.onReject(() => {
            this.logger.error("monitor rejected the connection");
        });
        this.client.onTunnel((proto, details) => {
            switch (proto) {
                case "vnc":
                    this.logger.debug("got vnc details from monitor");
                    const url = new URL(ensureString(details));
                    this.setAdapter(new VNCAdapter(url.hostname, +url.port,
                        url.hash.length > 1 ? url.hash.substring(1) : null));
                    break;
                case "inband":
                    this.setAdapter(this.client);
                    break;
            }
        });
        this.client.lec.connect(monitor);
    }

    protected override destroyImpl(): void | Promise<void> {
        this.client.lec.disconnect();
        if (this.adapter !== this.client) {
            this.adapter.disconnect();
        }
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
        adapter.onRect((x, y, fb) => this.rect(x, y, this.compress(fb.width, fb.height, fb.data)));
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
        return this.compress(400, nh, this.thumbdraw.getImageData(0, 0, 400, nh).data);
    }

    override getFrameBuffer(): Buffer {
        const fb = this.adapter.getFrameBuffer();
        return this.compress(fb.width, fb.height, fb.data);
    }

    protected override doReset() {
        this.client.doReset();
    }

    protected override async pushFile(name: string, data: Buffer, autorun: boolean) {
        this.client.pushFile(name, data, autorun);
    }

    protected override setMouse(x: number, y: number, buttons: number) {
        this.adapter.setMouse(x, y, buttons);
    }

    protected override setKey(keycode: number, on: boolean) {
        this.adapter.setKey(keycode, on);
    }

}