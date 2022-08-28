// aeon: an enhanced reimplementation of the CollabVM server
// Copyright (C) 2022 dither
// SPDX-License-Identifier: AGPL-3.0-only

import express from "express";
import exprws, { Application, Instance } from "express-ws";
import bodyparser from "body-parser";

import { wireprim, GatewayCap } from "@lucidvm/shared";

import type { ChannelController } from "../controller";
import { AuthManager } from "../auth";
import { UploadManager } from "../routes";
import { CommandManager } from "../commands";
import { Logger } from "../logger";

import { ClientContext, DispatchTable } from "./client";
import { baseMethods, capTables } from "./methods";

export interface InstanceInfo {
    name: string;
    sysop: string;
    contact: string;
}

const privateCaps: string[] = [];

export function registerPrivateExtension(cap: string, table: DispatchTable) {
    privateCaps.push(cap);
    capTables[cap] = table;
}

export class EventGateway {

    readonly logger = new Logger("gateway");
    readonly loghttp = new Logger("gateway:http");

    private readonly server: Instance;
    readonly express: Application;

    instanceInfo: InstanceInfo = {
        name: "LucidVM",
        sysop: "N/A",
        contact: "N/A"
    };

    private clients: Map<number, ClientContext> = new Map();
    private controllers: Map<string, ChannelController> = new Map();
    private nextid: number = 0;

    readonly commands: CommandManager = new CommandManager();
    readonly uploads: UploadManager;

    constructor(readonly auth: AuthManager, public authMandate = false, readonly maxPost = 8_000_000) {
        this.server = exprws(express());
        this.express = this.server.app;

        /*this.express.use((req, res, next) => {
            this.loghttp.debug(req.method, req.originalUrl);
            next();
        });*/
        this.express.use(bodyparser.raw({
            limit: maxPost
        }));
        
        this.express.ws("/", (ws, req) => {
            const id = this.nextid++;
            const ctx = new ClientContext(this, req, ws);
            ctx.loadDispatchTable(baseMethods);
            this.clients[id] = ctx;
            ws.on("close", () => delete this.clients[id])
        });

        this.uploads = new UploadManager(this.express);
    }

    listen(port: number, host: string) {
        this.server.app.listen(port, host);
        setInterval(() => {
            for (const id in this.clients) {
                this.clients[id].sendPing();
            }
        }, 15 * 1000);
    }

    getCaps(): string[] {
        const base: string[] = [
            GatewayCap.JSONTunnel,
            GatewayCap.LECTunnel,
            GatewayCap.Auth,
            GatewayCap.LegacyAuth,
            GatewayCap.LocalAuth,
            GatewayCap.Instance,
            GatewayCap.DontSanitize,
            GatewayCap.Poison
        ];
        return base.concat(privateCaps);
    }

    registerController(controller: ChannelController) {
        this.logger.print("registering controller to channel", controller.channel);
        this.controllers[controller.channel] = controller;
    }

    unregisterController(chan: string) {
        this.logger.print("unregistering controller to channel", chan);
        delete this.controllers[chan];
        this.send(chan, "chat", "", "The channel controller for this room has been detached. Please select a different room.");
    }

    getController(chan: string) {
        if (chan in this.controllers) return this.controllers[chan];
        return null;
    }

    getControllers() {
        return Object.values(this.controllers);
    }    

    getClients() {
        return Object.values(this.clients);
    }

    getChannelClients(channel: string) {
        return this.getClients().filter(x => x.channel === channel);
    }

    send(channel: string, ...args: wireprim[]) {
        if (channel == null) return;
        for (const client of this.getClients()) {
            if (client.channel !== channel) continue;
            client.send(...args);
        }
    }

    sendSpecial(channel: string, check: (ctx: ClientContext) => boolean, generate: (ctx: ClientContext) => wireprim[]) {
        if (channel == null) return;
        for (const client of this.getClients()) {
            if (client.channel !== channel || !check(client)) continue;
            client.send(...generate(client));
        }
    }

    sendExclude(channel: string, exclude: ClientContext, ...args: wireprim[]) {
        if (channel == null) return;
        for (const client of this.getClients()) {
            if (client === exclude || client.channel !== channel) continue;
            client.send(...args);
        }
    }

    nickInUse(channel: string, nick: string): boolean {
        return this.getClients().filter(x => x.nick != null &&
            (x.channel?.toLowerCase() === channel?.toLowerCase()) &&
            (x.nick?.toLowerCase() === nick?.toLowerCase())).length > 0;
    }

    announcePeer(peer: ClientContext, leaving = false) {
        if (peer.channel == null) return;
        this.logger.print(`${peer.nick} (${peer.ip}) has ${leaving ? "left" : "joined"} ${peer.channel}`);
        for (const client of this.getClients()) {
            if (client.channel !== peer.channel) continue;
            client.sendPeers([peer], leaving);
        }
    }

    announceRename(peer: ClientContext, oldnick: string) {
        if (peer.channel == null) return;
        this.logger.print(`${oldnick} (${peer.ip}) is now known as ${peer.nick}`);
        for (const client of this.getClients()) {
            if (client === peer || client.channel !== peer.channel) continue;
            client.sendPeerRename(peer, oldnick);
        }
    }

    sendChat(author: ClientContext, content: string) {
        if (author.channel == null) return;
        this.logger.print(`${author.nick}: ${content}`);
        for (const client of this.getClients()) {
            if (client.channel !== author.channel) continue;
            client.sendChat(author, content);
        }
    }

}

export * from "./client";