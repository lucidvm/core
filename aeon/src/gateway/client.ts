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

import type { EventGateway } from "./index";

export interface DispatchTable {
    [k: string]: ((ctx: ClientContext, ...args: wireprim[]) => void | Promise<void>);
}

const anonpermitted: Record<string, boolean> = {
    nop: true,
    connect: true,
    disconnect: true,
    list: true,
    rename: true,
    admin: true,

    extend: true,
    upgrade: true,
    auth: true,
    instance: true,
    cap: true
};

export class ClientContext {

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
        this.ip = req.socket.remoteAddress;
        ws.on("message", async x => {
            try {
                const stmts = this.conduit.unpack(x);
                for (const stmt of stmts) {
                    const opcode = ensureString(stmt.shift());
                    if (gw.authMandate && !hasCap(this.authcaps, AuthCap.Registered) && !anonpermitted[opcode]) {
                        console.warn("rejected opcode " + opcode + " from unauthenticated user");
                        return;
                    }
                    if (opcode in this.dispatch) {
                        await this.dispatch[opcode](this, ...stmt);
                    }
                    else {
                        await gw.getController(this.channel)?.interpret(this, opcode, ...stmt);
                    }
                }
            }
            catch (e) {
                console.error("error processing websocket message");
                console.error(x);
                console.error(e);
            }
        });
        ws.on("close", () => {
            if (this.channel != null) {
                // XXX: kind of ugly!
                this.dispatch["disconnect"](this, true);
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

}