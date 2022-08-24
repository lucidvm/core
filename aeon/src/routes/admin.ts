import express from "express";

import { ClientIdentity, Flag, hasFlag } from "../auth";
import type { EventGateway } from "../core";
import type { ConfigKey } from "../db";
import type { ConfigManager, MachineManager } from "../manager";

export function mountAdminAPI(gw: EventGateway, config: ConfigManager, machines: MachineManager) {
    const router = express.Router();
    router.use(async (req, res, next) => {
        function err() {
            res.status(403);
            res.contentType("txt");
            res.send("unauthorized");
            res.end();
        }
        const token = req.header("Authorization");
        if (token == null) { err(); return; }
        const identity = await gw.auth.validateToken(token);
        if (identity == null || identity.strategy !== "local" || !hasFlag(identity.flags, Flag.API)) { err(); return; }
        res.locals.identity = identity;
        next();
    });
    router.use(express.json());
    router.use((err, req, res, next) => {
        console.error("error processing request", err);
        res.status(500);
        res.end();
    });

    router.get("/debug/ping", (req, res) => {
        const identity: ClientIdentity = res.locals.identity;
        res.type("txt");
        res.send(`hello, ${identity.strategy}/${identity.id}!`);
    });

    // global config
    router.get("/config/:key", async (req, res) => {
        const value = config.isSecret(req.params.key as ConfigKey)
            ? "*******" // dont disclose secrets
            : await config.getOption(req.params.key as ConfigKey);
        res.send({ key: req.params.key, value });
        res.end();
    });
    router.post("/config/:key", async (req, res) => {
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

    gw.express.use("/api/admin", router);
}