import path from "path";

import express from "express";
import exprws, { Instance } from "express-ws";
import bodyparser from "body-parser";

import type { wireprim } from "@lucidvm/conduit";

import type { ChannelController } from "../controller";
import { AuthDriver, XBTCodec } from "../auth";

import { ClientContext } from "./client";

export class EventGateway {

    private server: Instance;

    private clients: { [k: number]: ClientContext } = {};
    private controllers: { [k: string]: ChannelController } = {};
    private authdrivers: { [k: string]: AuthDriver } = {};
    private postcbs: { [k: string]: (data: Buffer) => void } = {};
    private nextid: number = 0;

    readonly xbt: XBTCodec<[string, string | number]>;

    readonly authMandate: boolean;
    readonly maxPost: number;

    constructor(xbtsecret: string, authmandate = false, maxbody = 8_000_000) {
        this.xbt = new XBTCodec(xbtsecret);
        this.authMandate = authmandate;
        this.maxPost = maxbody;

        this.server = exprws(express());
        this.server.app.use((req, res, next) => {
            console.log(req.method, req.originalUrl);
            next();
        });
        this.server.app.use(bodyparser.raw({
            limit: maxbody
        }));
        this.server.app.post("/upload", (req, res) => {
            res.contentType("txt");

            // ugly, not sure what else to do though
            const key = req.originalUrl.split("?")[1];
            if (key in this.postcbs) {
                const cb = this.postcbs[key];
                // dont allow replaying!
                delete this.postcbs[key];
                // process the uploaded file
                cb(req.body);

                res.send("ok");
                res.status(202);
            }
            else {
                res.send("bad token");
                res.status(403);
            }

            res.end();
        });
        this.server.app.ws("/", (ws, req) => {
            const id = this.nextid++;
            const ctx = new ClientContext(this, req, ws);
            this.clients[id] = ctx;
            ws.on("close", () => delete this.clients[id])
        });

        const wabase = path.resolve(__dirname, "../../../webapp-legacy");
        //console.log(wabase);
        this.server.app.use(express.static(path.join(wabase, "dist")));
        this.server.app.use(express.static(path.join(wabase, "static")));
    }

    listen(port: number, host: string) {
        this.server.app.listen(port, host);
        setInterval(() => {
            for (const id in this.clients) {
                this.clients[id].sendPing();
            }
        }, 15 * 1000);
    }

    registerPostCallback(token: string, cb: (data: Buffer) => void) {
        this.postcbs[token] = cb;
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

}