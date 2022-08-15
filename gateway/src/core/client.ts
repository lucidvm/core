import { WebSocket } from "ws";
import { Request } from "express";
import he from "he";

import { wireblob, wireprim, wirestr, ensureString, EventConduit, GuacConduit } from "@lucidvm/conduit";

import { UserRank, ClientIdentity } from "../auth";

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
    rank: UserRank = UserRank.Anonymous;

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
                    //console.log(stmt);
                    const opcode = ensureString(stmt.shift());
                    if (gw.authMandate && this.rank <= UserRank.Anonymous && !anonpermitted[opcode]) {
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
            //console.log("CLOSE");
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
        this.rank = identity.rank;
        if (this.channel != null) {
            this.gw.send(this.channel, "adduser", 1, this.nick, this.rank);
            this.gw.getController(this.channel)?.notifyIdentify(this);
        }
    }

    send(...args: wireprim[]) {
        this.ws.send(this.conduit.pack(...args));
    }

    sendPing() {
        this.send("nop");
    }

    sendList(data: { id: wirestr, name: wirestr, thumbnail: wireblob }[]) {
        this.send("list", ...data.map(x => [x.id, x.name, x.thumbnail]).flat());
    }

    sendRename(newnick: string, error: number = 0) {
        this.send("rename", false, error, newnick);
    }

}