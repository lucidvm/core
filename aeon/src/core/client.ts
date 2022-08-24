import { WebSocket } from "ws";
import { Request } from "express";
import he from "he";

import {
    wireblob, wireprim, wirestr,
    ensureString,
    EventConduit, GuacConduit
} from "@lucidvm/shared";

import { ClientIdentity, Flag, getLegacyRank, hasFlag } from "../auth";

import type { EventGateway } from "./gateway";
import { defaultMethods } from "./methods";

export enum ExtensionLevel {
    Base,
    V1
}

const anonpermitted: { [k:string]: boolean } = {
    nop: true,
    connect: true,
    disconnect: true,
    list: true,
    rename: true,
    admin: true,

    extend: true,
    upgrade: true,
    auth: true
};

export class ClientContext {

    readonly ws: WebSocket;
    readonly gw: EventGateway;
    readonly ip: string;

    level: ExtensionLevel = ExtensionLevel.Base;
    strip = true;

    strategy: string = "anonymous";
    mask: number = Flag.None;

    nick: string;
    channel: string = null;

    conduit: EventConduit = new GuacConduit();

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
                    if (gw.authMandate && !hasFlag(this.mask, Flag.Registered) && !anonpermitted[opcode]) {
                        console.warn("rejected opcode " + opcode + " from unauthenticated user");
                        return;
                    }
                    if (opcode in defaultMethods) {
                        await defaultMethods[opcode](this, ...stmt);
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
                defaultMethods["disconnect"](this, true);
            }
        });

        this.send("extend", "lucid", ExtensionLevel.V1);
    }

    sanitize(str: string): string {
        if (!this.strip) return str;
        return he.escape(str);
    }

    guestify() {
        this.nick = "guest" + Math.ceil(Math.random() * 65536);
        return this.nick;
    }

    setIdentity(identity: ClientIdentity) {
        this.mask = identity.flags;
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
        var data: [string, number?][] = peers.map(x => leaving ? [x.nick] : [x.nick, getLegacyRank(x.mask)]);
        if (this.strip) data.map(x => x[0] = this.sanitize(x[0]));
        this.send(leaving ? "remuser" : "adduser", peers.length, ...data.flat());
    }

    sendChat(peer: ClientContext, content: string) {
        this.send("chat", this.sanitize(peer.nick), this.sanitize(content));
    }

}