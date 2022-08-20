import { EventEmitter } from "events";
import { Buffer } from "buffer";

import { WebSocket } from "ws";

import { Codebooks } from "@lucidvm/shared";
import {
    ensureBoolean, ensureBuffer, ensureNumber, ensureString,
    EventConduit, GuacConduit, JSONConduit, LECConduit,
    wireblob, wirebool, wirenum, wireprim, wirestr
} from "@lucidvm/conduit";

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

// lut from guacamole
const compositeOperation: { [key: number]: GlobalCompositeOperation } = {
/*  0x0 NOT IMPLEMENTED */
    0x1: "destination-in",
    0x2: "destination-out",
/*  0x3 NOT IMPLEMENTED */
    0x4: "source-in",
/*  0x5 NOT IMPLEMENTED */
    0x6: "source-atop",
/*  0x7 NOT IMPLEMENTED */
    0x8: "source-out",
    0x9: "destination-atop",
    0xA: "xor",
    0xB: "destination-over",
    0xC: "copy",
/*  0xD NOT IMPLEMENTED */
    0xE: "source-over",
    0xF: "lighter"
};

// low-level CVMP client
export class CVMPClient extends EventEmitter {

    private ws: WebSocket;
    private closing = true;
    protected conduit: EventConduit;

    private nick: string;
    protected level: number;

    get active(): boolean {
        return this.ws != null && this.ws.readyState === WebSocket.OPEN;
    }

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
                    ctx.emit("reject:join");
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

        // resolution update
        size(ctx, layer: wirenum, width: wirenum, height: wirenum) {
            ctx.emit("size", ensureNumber(layer), ensureNumber(width), ensureNumber(height));
        },

        // move layer relative to another
        move(ctx, layer: wirenum, parent: wirenum, x: wirenum, y: wirenum, z: wirenum) {
            ctx.emit("move", ensureNumber(layer), ensureNumber(parent), ensureNumber(x), ensureNumber(y), ensureNumber(z));
        },

        // rectangle update
        png(ctx, comp: wirenum, layer: wirenum, x: wirenum, y: wirenum, data: wireblob) {
            comp = ensureNumber(comp);
            if (!(comp in compositeOperation)) {
                throw new Error("server specified a nonsense composite operation index");
            }
            const op = compositeOperation[comp];
            data = ensureBuffer(data);
            ctx.emit("rect", ensureNumber(layer), ensureNumber(x), ensureNumber(y), op, data);
        },

        // framebuffer flush
        sync(ctx) {
            ctx.emit("sync");
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

    constructor() {
        super();
        // request to disable serverside sanitization
        this.on("ready", () => {
            //this.send("rename");
            if (this.level >= 1) {
                this.send("strip", false);
            }
        });
    }

    // connect to the event gateway
    // automatically attempts an extend handshake
    open(address: string) {
        if (this.active) {
            // already connected!
            return;
        }

        this.closing = false;
        this.conduit = new GuacConduit();
        this.ws = new WebSocket(address);
        this.ws.binaryType = "arraybuffer";

        // do handshake stuff on open
        this.ws.on("open", async () => {
            // perform extend handshake
            try {
                // wait for server to send extend info
                const level = await this.waitFor<number>("extend");
                // if the server doesnt support lucid-1, continue
                if (level >= 1)  {
                    // request a conduit upgrade to lec
                    this.send("upgrade", "lec");
                    // wait for server to confirm
                    const mode = await this.waitFor<string>("upgrade");

                    // if we are indeed using lec, request the codebook
                    if (mode === "lec") {
                        this.send("codebook");
                        await this.waitFor("codebook");
                    }
                }
            }
            catch (ex) {
                this.level = 0;
                console.warn("extend handshake failed, assuming legacy server");
                console.warn(ex);
            }

            // inform consumer that we're ready
            this.emit("ready");
        });

        const handleClose = () => {
            this.emit("close");
            if (!this.closing) {
                console.warn("connection to gateway lost, reconnecting...");
                this.open(address);
            }
        }
        this.ws.on("close", handleClose);
        this.ws.on("error", handleClose);

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

    // disconnect from the event gateway
    close() {
        this.closing = true;
        if (this.active) {
            this.send("disconnect");
            this.ws.close();
        }
    }

    // send a raw instruction
    send(...args: wireprim[]) {
        this.ws.send(this.conduit.pack(...args));
    }

    // wait for a particular instruction to arrive
    waitFor<T>(event: string, timeout = 500): Promise<T> {
        return new Promise<T>((resolve, _reject) => {
            const reject = () => _reject("the server rejected the request!");
            const revent = "reject:" + event;
            var timer: any;
            const handler = (...x: any[]) => {
                clearTimeout(timer);
                this.off(revent, reject);
                if (x.length === 0) resolve(null);
                resolve(x.length > 1 ? x : x[0]);
            }
            this.once(event, handler);
            this.once(revent, reject);
            timer = setTimeout(() => {
                this.off(event, handler);
                this.off(revent, reject);
                _reject(new Error("operation timed out!"));
            }, timeout);
        });
    }

    // retrieve instance info (requires lucid-1 or higher)
    async retrieveInstanceInfo(): Promise<InstanceInfo> {
        if (this.level < 1) {
            return {
                software: "CollabVM",
                version: "1.x",
                name: "Legacy Instance",
                sysop: "unknown",
                contact: "unknown"
            };
        }
        this.send("instance");
        return this.waitFor<InstanceInfo>("instance");
    }

    // retrieve the room list
    retrieveList(): Promise<ListEntry[]> {
        this.send("list")
        return this.waitFor<ListEntry[]>("list");
    }

    // set the current user's nickname
    async setNick(nick: string): Promise<boolean> {
        this.send("rename", nick);
        const [status] = await this.waitFor<[number, string]>("nickset");
        return (this.nick === nick && status < 1);
    }

    // join a room
    join(room: string): Promise<RoomInfo> {
        this.send("connect", room);
        return this.waitFor<RoomInfo>("join");
    }

    // leave a room
    async part(): Promise<void> {
        this.send("disconnect");
        await this.waitFor<void>("part");
    }

    // say something in the chat
    say(text: string) {
        this.send("chat", text);
    }

}