// aeon: an enhanced reimplementation of the CollabVM server
// Copyright (C) 2022 dither
// SPDX-License-Identifier: AGPL-3.0-only

import path from "path";

import express from "express";

import { EventGateway } from "../gateway";

export function mountWebapp(gw: EventGateway) {
    const wabase = path.resolve(__dirname, "../../../flashback");
    gw.express.use(express.static(path.join(wabase, "dist")));
    gw.express.use(express.static(path.join(wabase, "static")));
}