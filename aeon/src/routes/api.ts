// aeon: an enhanced reimplementation of the CollabVM server
// Copyright (C) 2022 dither
// SPDX-License-Identifier: AGPL-3.0-only

import express, { Response } from "express";

import { ClientIdentity, AuthCap, hasCap, LocalDriver } from "../auth";
import type { EventGateway } from "../gateway";
import type { ConfigDriver, ConfigKey } from "../config";
import type { MachineManager } from "../manager";

function checkCap(res: Response, cap: AuthCap): boolean {
    if (!hasCap(res.locals.identity.caps, cap)) {
        res.status(403);
        res.send({ error: "unauthorized" });
        res.end();
        return true;
    }
    return false;
}

export function mountAPI(gw: EventGateway, config: ConfigDriver, machines: MachineManager, acl: LocalDriver) {
    const router = express.Router();
    router.use(async (req, res, next) => {
        function err() {
            res.status(403);
            res.send({ error: "unauthorized" });
            res.end();
        }
        const token = req.header("Authorization");
        if (token == null) { err(); return; }
        res.locals.token = token;
        const identity = await gw.auth.validateToken(token);
        if (identity == null || identity.strategy !== "local" || !hasCap(identity.caps, AuthCap.API)) { err(); return; }
        res.locals.identity = identity;
        res.header("Authorization", token);
        next();
    });
    router.use(express.json());
    router.use((err, req, res, next) => {
        console.error("error processing request", err);
        res.status(500);
        res.end();
    });

    // debug endpoints
    router.get("/debug/ping", (req, res) => {
        const identity: ClientIdentity = res.locals.identity;
        res.type("txt");
        res.send(`hello, ${identity.strategy}/${identity.id}!`);
    });

    // self
    router.patch("/self", async (req, res) => {
        if (typeof req.body.password === "undefined") {
            res.status(400);
            res.send({ error: "expected password" });
            res.end();
            return;
        }
        const identity: ClientIdentity = res.locals.identity;
        await acl.setPassword(identity.id.toString(), req.body.password);
        res.status(204);
        res.end();
    });
    router.post("/self/logout", async (req, res) => {
        await gw.auth.revoke(res.locals.token);
        res.removeHeader("Authorization");
        res.status(204);
        res.end();
    });

    // global config
    router.get("/config", (req, res) => {
        if (checkCap(res, AuthCap.Config)) return;
        const keys = config.getConfigMetadata();
        res.send(keys);
        res.end();
    });
    router.get("/config/:key", async (req, res) => {
        if (checkCap(res, AuthCap.Config)) return;
        if (!config.isValid(req.params.key as ConfigKey)) {
            res.status(404);
            res.send({ error: "invalid config key" });
            res.end();
            return;
        }
        const value = config.isSecret(req.params.key as ConfigKey)
            ? "*******" // dont disclose secrets
            : await config.getOption(req.params.key as ConfigKey);
        res.send({ key: req.params.key, value });
        res.end();
    });
    router.post("/config/:key", async (req, res) => {
        if (checkCap(res, AuthCap.Config)) return;
        if (!config.isValid(req.params.key as ConfigKey)) {
            res.status(404);
            res.send({ error: "invalid config key" });
            res.end();
            return;
        }
        if (typeof req.body.value !== "undefined") {
            await config.setOption(req.params.key as ConfigKey, req.body.value);
            res.status(202);
        }
        else {
            res.status(400);
            res.send({ error: "expected value" });
        }
        res.end();
    });

    // machine config
    router.get("/machines", async (req, res) => {
        if (checkCap(res, AuthCap.ManageVMs)) return;
        const entries = await machines.repo.find();
        res.send(entries);
        res.end();
    });
    router.put("/machines/:channel", async (req, res) => {
        if (checkCap(res, AuthCap.ManageVMs)) return;
        const info = await machines.repo.findOneBy({ channel: req.params.channel });
        if (info == null) {
            if (
                typeof req.body.remote !== "boolean" ||
                (
                    typeof req.body.details !== "string" &&
                    typeof req.body.details !== "object"
                )
            ) {
                res.status(400);
                res.send({ error: "expected remote and details" });
            }
            else {
                if (typeof req.body.details === "object") {
                    req.body.details = JSON.stringify(req.body.details);
                }
                await machines.create(req.params.channel, req.body.remote, req.body.details);
                res.status(201);
            }
        }
        else {
            res.status(409);
            res.send({ error: "machine channel already defined" });
        }
        res.end();
    });
    router.delete("/machines/:channel", async (req, res) => {
        if (checkCap(res, AuthCap.ManageVMs)) return;
        const info = await machines.repo.findOneBy({ channel: req.params.channel });
        if (info != null) {
            await machines.destroy(req.params.channel);
            res.status(204);
        }
        else {
            res.status(404);
            res.send({ error: "machine not found" });
        }
        res.end();
    });
    router.patch("/machines/:channel/config", async (req, res) => {
        if (checkCap(res, AuthCap.ManageRooms)) return;
        const info = await machines.repo.findOneBy({ channel: req.params.channel });
        if (info != null) {
            await machines.configure(req.params.channel, req.body);
            res.status(204);
        }
        else {
            res.status(404);
            res.send({ error: "machine not found" });
        }
        res.end();
    });

    // user management
    router.get("/users", async (req, res) => {
        if (checkCap(res, AuthCap.ManageUsers)) return;
        const entries = await acl.users.find();
        // sanitize sensitive things out
        res.send(entries.map(x => ({
            username: x.username,
            caps: x.caps,
            group: x.group.name
        })));
        res.end();
    });

    // group management
    router.get("/groups", async (req, res) => {
        if (checkCap(res, AuthCap.ManageGroups)) return;
        const entries = await acl.groups.find();
        res.send(entries.map(x => ({
            name: x.name,
            caps: x.caps
        })));
        res.end();
    });

    gw.express.use("/api", router);
}