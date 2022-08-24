import express from "express";
import exprws, { Application, Instance } from "express-ws";
import bodyparser from "body-parser";

import type { wireprim } from "@lucidvm/shared";

import type { ChannelController } from "../controller";
import { AuthDriver, XBTCodec } from "../auth";
import { UploadManager } from "../routes";
import { CommandHandler } from "../commands";

import { ClientContext } from "./client";

export class EventGateway {

    private readonly server: Instance;
    readonly express: Application;

    private clients: { [k: number]: ClientContext } = {};
    private controllers: { [k: string]: ChannelController } = {};
    private authdrivers: { [k: string]: AuthDriver } = {};
    private nextid: number = 0;

    readonly commands: CommandHandler = new CommandHandler();
    readonly uploads: UploadManager;
    readonly xbt: XBTCodec<[string, string | number]>;

    constructor(xbtsecret: string, readonly authMandate = false, readonly maxPost = 8_000_000) {
        this.xbt = new XBTCodec(xbtsecret);

        this.server = exprws(express());
        this.express = this.server.app;

        this.express.use((req, res, next) => {
            console.log(req.method, req.originalUrl);
            next();
        });
        this.express.use(bodyparser.raw({
            limit: maxPost
        }));
        
        this.express.ws("/", (ws, req) => {
            const id = this.nextid++;
            const ctx = new ClientContext(this, req, ws);
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

    registerController(controller: ChannelController) {
        this.controllers[controller.channel] = controller;
    }

    getController(chan: string) {
        if (chan in this.controllers) return this.controllers[chan];
        return null;
    }

    getControllers() {
        return Object.values(this.controllers);
    }

    async registerAuthDriver(driver: AuthDriver) {
        await driver.init();
        this.authdrivers[driver.id] = driver;
    }

    getAuthStrategies() {
        return Object.keys(this.authdrivers);
    }

    getAuthStrategy(key: string) {
        return this.authdrivers[key];
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
        for (const client of this.getClients()) {
            if (client.channel !== peer.channel) continue;
            client.sendPeers([peer], leaving);
        }
    }

    announceRename(peer: ClientContext, oldnick: string) {
        if (peer.channel == null) return;
        for (const client of this.getClients()) {
            if (client === peer || client.channel !== peer.channel) continue;
            client.sendPeerRename(peer, oldnick);
        }
    }

    sendChat(author: ClientContext, content: string) {
        if (author.channel == null) return;
        for (const client of this.getClients()) {
            if (client.channel !== author.channel) continue;
            client.sendChat(author, content);
        }
    }

}