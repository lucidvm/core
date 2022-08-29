// aeon: an enhanced reimplementation of the CollabVM server
// Copyright (C) 2022 dither
// SPDX-License-Identifier: AGPL-3.0-only

import { WebSocket } from "ws";
import { Request } from "express";
import he from "he";

import {
    wireblob, wireprim, wirestr,
    ensureString,
    EventConduit, GuacConduit,
    GatewayCap
} from "@lucidvm/shared";

import { ClientIdentity, AuthCap, getLegacyRank, hasCap } from "../auth";
import { Logger } from "../logger";
import { ConfigKey } from "../config";

import type { EventGateway } from "./index";

export type DispatchMethod = (ctx: ClientContext, ...args: wireprim[]) => void | Promise<void>;
export interface DispatchEntry {
    requires?: number;
    invoke: DispatchMethod;
}
export interface DispatchTable {
    [k: string]: DispatchEntry;
}

export class ClientContext {

    readonly logger: Logger;

    readonly ws: WebSocket;
    readonly gw: EventGateway;
    readonly ip: string;

    readonly gwcaps: Map<string, boolean> = new Map();

    strategy: string = "anonymous";
    authcaps: number = AuthCap.None;

    nick: string;
    channel: string = null;

    conduit: EventConduit = new GuacConduit();

    private dispatch: DispatchTable = { };

    constructor(gw: EventGateway, req: Request, ws: WebSocket) {
        this.gw = gw;
        this.ws = ws;
        this.guestify();
        const forwarded = req.header("X-Forwarded-For");
        this.ip = forwarded ?? req.socket.remoteAddress;
        this.logger = new Logger("client:" + this.ip);
        this.logger.print("connecting!");
        ws.on("message", async x => {
            try {
                const mustauth = await gw.config.getOptionBool(ConfigKey.AuthMandatory);
                const stmts = this.conduit.unpack(x);
                for (const stmt of stmts) {
                    const opcode = ensureString(stmt.shift());
                    if (opcode in this.dispatch) {
                        const data = this.dispatch[opcode];
                        const mask = data.requires ?? (mustauth ? AuthCap.Registered : AuthCap.None);
                        if (hasCap(this.authcaps, mask)) {
                            await data.invoke(this, ...stmt);
                        }
                        else {
                            this.logger.warn(`rejected base opcode ${opcode} (${this.authcaps.toString(2).padStart(32, "0")} vs ${mask.toString(2).padStart(32, "0")})`);
                        }
                    }
                    else {
                        if (mustauth && !hasCap(this.authcaps, AuthCap.Registered)) {
                            this.logger.warn(`declining to forward opcode ${opcode} to controller (client not registered)`);
                            return;
                        }
                        await gw.getController(this.channel)?.interpret(this, opcode, ...stmt);
                    }
                }
            }
            catch (e) {
                this.logger.error("error processing websocket message");
                this.logger.error("this is a bug");
                console.error(x);
                console.error(e);
            }
        });
        ws.on("close", () => {
            this.logger.print("disconnecting!");
            if (this.channel != null) {
                // XXX: kind of ugly!
                this.dispatch["disconnect"].invoke(this, true);
            }
        });

        this.send("cap", 0, ...this.gw.getCaps());
    }

    loadDispatchTable(table: DispatchTable) {
        Object.assign(this.dispatch, table);
    }

    sanitize(str: string): string {
        if (this.gwcaps[GatewayCap.DontSanitize]) return str;
        return he.escape(str);
    }

    guestify() {
        this.nick = "guest" + Math.ceil(Math.random() * 65536);
        return this.nick;
    }

    setIdentity(identity: ClientIdentity) {
        this.logger.print(`authenticated as ${identity.strategy}/${identity.id} (${identity.caps.toString(2).padStart(32, "0")})`);
        this.authcaps = identity.caps;
        if (this.channel != null) {
            this.gw.announcePeer(this);
            this.gw.getController(this.channel)?.notifyIdentify(this);
        }
    }

    send(...args: wireprim[]) {
        this.ws.send(this.conduit.pack(...args));
    }

    announce(text: string) {
        this.send("chat", "", text);
    }

    sendPing() {
        this.send("nop");
    }

    sendList(data: { id: wirestr, name: wirestr, thumbnail: wireblob }[]) {
        this.send("list", ...data.map(x => [x.id, x.name, x.thumbnail]).flat());
    }

    sendRename(newnick: string, error: number = 0) {
        this.send("rename", false, error, this.sanitize(newnick));
    }

    sendPeerRename(peer: ClientContext, oldnick: string) {
        this.send("rename", true, this.sanitize(oldnick), this.sanitize(peer.nick));
    }

    sendPeers(peers: ClientContext[], leaving = false) {
        var data: [string, number?][] = peers.map(x => leaving ? [x.nick] : [x.nick, getLegacyRank(x.authcaps)]);
        if (!this.gwcaps[GatewayCap.DontSanitize]) data.map(x => x[0] = this.sanitize(x[0]));
        this.send(leaving ? "remuser" : "adduser", peers.length, ...data.flat());
    }

    sendChat(peer: ClientContext, content: string) {
        this.send("chat", this.sanitize(peer.nick), this.sanitize(content));
    }

    toString() {
        return `${this.nick} (${this.ip})`;
    }

}