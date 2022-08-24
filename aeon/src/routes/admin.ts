import express, { Response } from "express";

import { ClientIdentity, Flag, hasFlag, LocalDriver } from "../auth";
import type { EventGateway } from "../core";
import type { ConfigKey } from "../db";
import type { ConfigManager, MachineManager } from "../manager";

function checkFlag(res: Response, flag: Flag): boolean {
    if (!hasFlag(res.locals.identity.flags, flag)) {
        res.status(403);
        res.send({ error: "unauthorized" });
        res.end();
        return true;
    }
    return false;
}

export function mountAdminAPI(gw: EventGateway, config: ConfigManager, machines: MachineManager, acl: LocalDriver) {
    const router = express.Router();
    router.use(async (req, res, next) => {
        function err() {
            res.status(403);
            res.send({ error: "unauthorized" });
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

    // global config
    router.get("/config", (req, res) => {
        if (checkFlag(res, Flag.Config)) return;
        const keys = config.getConfigMetadata();
        res.send(keys);
        res.end();
    });
    router.get("/config/:key", async (req, res) => {
        if (checkFlag(res, Flag.Config)) return;
        const value = config.isSecret(req.params.key as ConfigKey)
            ? "*******" // dont disclose secrets
            : await config.getOption(req.params.key as ConfigKey);
        res.send({ key: req.params.key, value });
        res.end();
    });
    router.post("/config/:key", async (req, res) => {
        if (checkFlag(res, Flag.Config)) return;
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
        if (checkFlag(res, Flag.ManageVMs)) return;
        const entries = await machines.repo.find();
        res.send(entries);
        res.end();
    });
    router.put("/machines/:channel", async (req, res) => {
        if (checkFlag(res, Flag.ManageVMs)) return;
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
        if (checkFlag(res, Flag.ManageVMs)) return;
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
        if (checkFlag(res, Flag.ManageRooms)) return;
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
        if (checkFlag(res, Flag.ManageUsers)) return;
        const entries = await acl.users.find();
        // sanitize sensitive things out
        res.send(entries.map(x => ({
            username: x.username,
            mask: x.mask,
            group: x.group.name
        })));
        res.end();
    });

    // group management
    router.get("/groups", async (req, res) => {
        if (checkFlag(res, Flag.ManageGroups)) return;
        const entries = await acl.groups.find();
        res.send(entries.map(x => ({
            name: x.name,
            mask: x.mask
        })));
        res.end();
    });

    gw.express.use("/api/admin", router);
}