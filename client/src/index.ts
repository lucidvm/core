import { EventEmitter } from "events";
import { Buffer } from "buffer";

import { WebSocket } from "ws";

import { Codebooks } from "@lucidvm/shared";
import { ensureBoolean, ensureBuffer, ensureNumber, ensureString, EventConduit, GuacConduit, JSONConduit, LECConduit, wirebool, wirenum, wireprim, wirestr } from "@lucidvm/conduit";

export interface InstanceInfo {
    software: string;
    version: string;
    name: string;
    sysop: string;
    contact: string;
}

export interface ListEntry {
    id: string;
    name: string;
    thumbnail: Buffer;
}

export interface RoomInfo {
    turns: boolean;
    votes: boolean;

    uploads: boolean;
    maxPost: number;
    maxFilename: number;
}

export interface ChatEntry {
    nick: string;
    message: string;
}

const LUCID_LEVEL = 1;

// low-level CVMP client
export class CVMPClient extends EventEmitter {

    private ws: WebSocket;
    protected conduit: EventConduit;

    private nick: string;
    protected level: number;

    private static readonly defaultMethods: {
        [k: string]: ((ctx: CVMPClient, ...args: wireprim[]) => void | Promise<void>)
    } = {
    
        // base cvmp
    
        // ping/pong
        nop(ctx) {
            ctx.send("nop");
        },
    
        // receive connection state
        connect(ctx, state: wirenum,
            turns: wirebool, votes: wirebool, uploads: wirebool,
            maxPost: wirenum, maxFilename: wirenum) {
            switch (ensureNumber(state)) {
                case 0:
                    ctx.emit("fail");
                    break;
                case 1:
                    turns = ensureBoolean(turns);
                    votes = ensureBoolean(votes);
                    uploads = ensureBoolean(uploads);
                    maxPost = ensureNumber(maxPost);
                    maxFilename = ensureNumber(maxFilename);
                    const info: RoomInfo = {
                        turns, votes, uploads,
                        maxPost, maxFilename
                    };
                    ctx.emit("join", info);
                    break;
                case 2:
                    ctx.emit("part");
                    break;
            }
        },

        // receive room list
        list(ctx, ...data: wireprim[]) {
            if (data.length % 3) {
                throw new Error("list payload elements not modulo 3");
            }
            const entries: ListEntry[] = [];
            for (var i = 0; i < data.length; i += 3) {
                entries.push({
                    id: ensureString(data[i + 0]),
                    name: ensureString(data[i + 1]),
                    thumbnail: ensureBuffer(data[i + 2])
                });
            }
            ctx.emit("list", entries);
        },

        // process rename event
        rename(ctx, other: wirebool, arg0: wireprim, arg1: wireprim) {
            if (ensureBoolean(other)) {
                // another user's nick changed
                const nold = ensureString(arg0);
                const nnew = ensureString(arg1);
                ctx.emit("rename", nold, nnew);
            }
            else {
                // setting current user's nick
                const status = ensureNumber(arg0);
                const nick = ensureString(arg1);
                ctx.nick = nick;
                ctx.emit("nickset", status, nick);
            }
        },

        // receive chat message
        chat(ctx, ...data: wireprim[]) {
            if (data.length % 2) {
                throw new Error("chat payload elements not modulo 2");
            }
            for (var i = 0; i < data.length; i += 2) {
                ctx.emit("chat", {
                    nick: ensureString(data[i + 0]),
                    message: ensureString(data[i + 1])
                });
            }
        },

        // lucid-1 extensions

        // declare protocol extension support
        extend(ctx, suite: wirestr, level: wirenum) {
            if (ensureString(suite) === "lucid") {
                ctx.level = Math.min(LUCID_LEVEL, ensureNumber(level));
                ctx.send("extend", "lucid", level);
                ctx.emit("extend", level);
            }
            // we only support the lucid suite
        },
    
        // upgrade to a different event conduit
        upgrade(ctx, accepted: wirebool, target: wirestr) {
            if (ensureBoolean(accepted)) {
                switch (ensureString(target)) {
                    case "guac":
                        ctx.conduit = new GuacConduit();
                        break;
                    case "json":
                        ctx.conduit = new JSONConduit();
                        break;
                    case "lec":
                        ctx.conduit = new LECConduit(Codebooks.CVMP);
                        break;
                }
                ctx.emit("upgrade", target);
            }
        },

        // load the server's LEC codebook
        codebook(ctx, ...codebook: wirestr[]) {
            if (ctx.conduit instanceof LECConduit) {
                ctx.conduit.updateCodebook(codebook.map(ensureString));
                ctx.emit("codebook");
            }
        },

        // TODO
        auth() {

        },

        // get information abotu this instance
        instance(ctx, software: wirestr, version: wirestr,
            name: wirestr, sysop: wirestr, contact: wirestr) {
            const info: InstanceInfo = {
                software,
                version,
                name,
                sysop,
                contact
            };
            ctx.emit("instance", info);
        }
    
    };

    constructor(readonly address: string) {
        super();

        // request to disable serverside sanitization
        this.on("ready", () => {
            //this.send("rename");
            if (this.level >= 1) {
                this.send("strip", false);
            }
        });
    }

    connect() {
        var toh: any;

        this.conduit = new GuacConduit();
        this.ws = new WebSocket(this.address);

        // do handshake stuff on open
        this.ws.on("open", () => {
            // listener functions
            var a, b, c;

            // wait for extend opcode
            this.once("extend", a = (lvl: number) => {
                // we got extend, cancel timeout and follow handshake
                clearTimeout(toh);
                // request to upgrade to lec
                this.send("upgrade", "lec");
            });
            // wait for upgrade to lec
            this.once("upgrade", b = (mode: string) => {
                // only lec is relevant here
                if (mode === "lec") {
                    // request the server's codebook
                    this.send("codebook");
                }
                else {
                    // clear listener for codebook
                    this.off("codebook", c);
                    this.emit("ready");
                }
            });
            // wait for codebook
            this.once("codebook", c = () => {
                // should be ready now!
                this.emit("ready");
            });

            // extend timeout
            // if we dont receive and extend opcode before this elapses,
            // we assume this is a legacy/non-lucid server
            toh = setTimeout(() => {
                // clear listeners
                this.off("extend", a);
                this.off("upgrade", b);
                this.off("codebook", c);

                // level 0
                this.level = 0;
                
                // ready!
                this.emit("ready");
            }, 250);

            // emit open event, even though it's kind of useless
            this.emit("open");
        });

        // handle incoming event
        this.ws.on("message", async msg => {
            try {
                // unpack with event conduit
                const stmts = this.conduit.unpack(msg);
                // process statements
                for (const stmt of stmts) {
                    const opcode = ensureString(stmt.shift());
                    if (opcode in CVMPClient.defaultMethods) {
                        await CVMPClient.defaultMethods[opcode](this, ...stmt);
                    }
                    // ignore unrecognized opcodes
                }
            }
            catch (e) {
                console.error("error processing websocket message");
                console.error(msg);
                console.error(e);
            }
        });
    }

    send(...args: wireprim[]) {
        this.ws.send(this.conduit.pack(...args));
    }

    retrieveInstanceInfo(): Promise<InstanceInfo> {
        return new Promise(resolve => {
            if (this.level < 1) {
                resolve({
                    software: "CollabVM",
                    version: "1.x",
                    name: "Legacy Instance",
                    sysop: "unknown",
                    contact: "unknown"
                });
                return;
            }
            this.once("instance", resolve);
            this.send("instance");
        });
    }

    retrieveList(): Promise<ListEntry[]> {
        return new Promise(resolve => {
            this.once("list", resolve);
            this.send("list");
        });
    }

    setNick(nick: string): Promise<boolean> {
        return new Promise(resolve => {
            this.once("nickset", (status, nick) => {
                resolve(this.nick === nick && status < 1);
            });
            this.send("rename", nick);
        });
    }

    join(room: string): Promise<RoomInfo> {
        return new Promise(resolve => {
            this.once("join", resolve);
            this.send("connect", room);
        });
    }

    part(): Promise<void> {
        return new Promise(resolve => {
            this.once("part", resolve);
            this.send("disconnect");
        });
    }

    say(text: string) {
        this.send("chat", text);
    }

}