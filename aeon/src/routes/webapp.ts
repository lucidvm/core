// aeon: an enhanced reimplementation of the CollabVM server
// Copyright (C) 2022 dither
// SPDX-License-Identifier: AGPL-3.0-only

import path from "path";

import express from "express";

import { EventGateway } from "../gateway";

export function mountWebapp(gw: EventGateway) {
    const base = path.resolve(__dirname, "../../static");
    gw.express.use(express.static(base));

    const flashback = path.resolve(__dirname, "../../../flashback");
    gw.express.use("/flashback", express.static(path.join(flashback, "dist")));
    gw.express.use("/flashback", express.static(path.join(flashback, "static")));

    const satori = path.resolve(__dirname, "../../../satori");
    gw.express.use(express.static(path.join(satori, "dist")));
    gw.express.use(express.static(path.join(satori, "static")));

    // fallback route for satori
    gw.express.get("/*", (req, res) => {
        res.sendFile(path.join(satori, "dist", "index.html"));
    });
}