import express from "express";

import { ClientIdentity, Flag, hasFlag } from "../auth";
import { EventGateway } from "../core";
import { ConfigManager, MachineManager } from "../manager";

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
        if (identity == null || identity.strategy !== "local" 
            || hasFlag(identity.flags, Flag.API)) { err(); return; }
        res.locals.identity = identity;
        next();
    });
    router.get("/status", (req, res) => {
        const identity: ClientIdentity = res.locals.identity;
        res.type("txt");
        res.send(`hello, ${identity.strategy}/${identity.id}!`);
    });
    gw.express.use("/api/admin", router);
}