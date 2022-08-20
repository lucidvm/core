import path from "path";

import express, { Application } from "express";

export function mountWebapp(app: Application) {
    const wabase = path.resolve(__dirname, "../../../flashback");
    app.use(express.static(path.join(wabase, "dist")));
    app.use(express.static(path.join(wabase, "static")));
}