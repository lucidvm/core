// aeon: an enhanced reimplementation of the CollabVM server
// Copyright (C) 2022 dither
// SPDX-License-Identifier: AGPL-3.0-only

import { Application } from "express";

export class UploadManager {

    private postcbs: Map<string, (data: Buffer) => void> = new Map();

    constructor(app: Application) {
        app.post("/upload", (req, res) => {
            res.contentType("txt");

            // ugly, not sure what else to do though
            const key = req.originalUrl.split("?")[1];
            if (this.postcbs.has(key)) {
                const cb = this.postcbs.get(key);
                // dont allow replaying!
                this.postcbs.delete(key);
                // process the uploaded file
                cb(req.body);

                res.send("ok");
                res.status(202);
            }
            else {
                res.send("bad token");
                res.status(403);
            }

            res.end();
        });
    }

    registerPostCallback(token: string, cb: (data: Buffer) => void) {
        this.postcbs.set(token, cb);
    }

}