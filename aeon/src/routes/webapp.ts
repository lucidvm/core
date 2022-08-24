import path from "path";

import express, { Application } from "express";

import { EventGateway } from "../core";

export function mountWebapp(gw: EventGateway) {
    const wabase = path.resolve(__dirname, "../../../flashback");
    gw.express.use(express.static(path.join(wabase, "dist")));
    gw.express.use(express.static(path.join(wabase, "static")));
}