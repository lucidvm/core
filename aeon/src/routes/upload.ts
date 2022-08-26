import { Application } from "express";

export class UploadManager {

    private postcbs: Map<string, (data: Buffer) => void> = new Map();

    constructor(app: Application) {
        app.post("/upload", (req, res) => {
            res.contentType("txt");

            // ugly, not sure what else to do though
            const key = req.originalUrl.split("?")[1];
            if (key in this.postcbs) {
                const cb = this.postcbs[key];
                // dont allow replaying!
                delete this.postcbs[key];
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
        this.postcbs[token] = cb;
    }

}