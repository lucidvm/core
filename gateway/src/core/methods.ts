import he from "he";

import { Codebooks } from "@lucidvm/shared";

import {
    EventConduit, GuacConduit, JSONConduit, LECConduit,
    wireprim, wirestr, wirenum, wirebool,
    ensureString, ensureNumber, 
} from "@lucidvm/conduit";

import type { ClientContext } from "./client";
import { lex, commands } from "./commands";

const RENAME_OK = 0;
const RENAME_INUSE = 1;
const RENAME_INVALID = 2;
const RENAME_BADWORD = 3;

const AUTH_ADVERTISE = 0;
const AUTH_USE = 1;
const AUTH_IDENTIFY = 2;
const AUTH_SESSION = 3;
const AUTH_REJECT = 4;
const AUTH_NONSENSE = 5;
const AUTH_STALE = 6;

export const defaultMethods: {
    [k: string]: ((ctx: ClientContext, ...args: wireprim[]) => void | Promise<void>)
} = {

    // base protocol

    nop() { },

    connect(ctx, channel: wirestr) {
        if (channel == null) return;

        // nick setup
        if (ctx.nick == null) ctx.guestify();
        if (ctx.gw.nickInUse(channel, ctx.nick)) {
            ctx.sendRename(ctx.guestify(), RENAME_INUSE);
        }
        else {
            ctx.sendRename(ctx.nick, RENAME_OK);
        }

        // actually attach to the channel
        ctx.channel = channel;
        ctx.gw.getController(ctx.channel)?.notifyJoin(ctx);

        // send channel peer list
        const peers = ctx.gw.getChannelClients(channel);
        ctx.send("adduser", peers.length, ...peers.map(x => [x.nick, x.rank]).flat());
        ctx.gw.sendExclude(channel, ctx, "adduser", 1, ctx.nick, ctx.rank);
    },

    disconnect(ctx, internal: wirebool) {
        const chan = ctx.channel;
        ctx.channel = null;
        if (chan != null) {
            ctx.gw.getController(chan)?.notifyPart(ctx);
            ctx.gw.send(chan, "remuser", 1, ctx.nick);
        }
    },

    list(ctx) {
        ctx.sendList(
            ctx.gw.getControllers().map(x => ({
                id: x.channel,
                name: x.displayName,
                thumbnail: x.getThumbnail()
            }))
        );
    },

    rename(ctx, nick: wirestr) {
        if (nick == null) return;

        // sanitize that name!
        nick = he.encode(nick);

        if (nick.toLowerCase() === ctx.nick.toLowerCase()) return;
        if (ctx.channel != null) {
            if (ctx.gw.nickInUse(ctx.channel, nick)) {
                ctx.sendRename(ctx.nick, RENAME_INUSE);
                return;
            }
            ctx.sendRename(nick, RENAME_OK);
            ctx.gw.sendExclude(ctx.channel, ctx, "rename", true, ctx.nick, nick);
        }
        const oldnick = ctx.nick;
        ctx.nick = nick;
        ctx.gw.getController(ctx.channel)?.notifyNick(ctx, oldnick);
    },

    chat(ctx, text: wirestr) {
        if (ctx.channel == null) return;

        // XXX: messy
        if (text.startsWith("//")) {
            text = text.substring(1);
        }
        else if (text.startsWith("/")) {
            const raw = text.substring(1);
            const args = lex(raw);
            const cmd = args.shift();
            if (!(cmd in commands)) {
                ctx.send("chat", "", "Unknown command.");
                return;
            }
            const adv = raw.indexOf(" ");
            commands[cmd](ctx, adv > 0 ? raw.substring(adv) : "", ...args);
            return;
        }

        // dont forget to sanitize
        text = he.encode(text);

        text = ensureString(text);
        ctx.gw.send(ctx.channel, "chat", ctx.nick, text);
    },

    async admin(ctx, command: wirenum, data: wirestr) {
        switch (ensureNumber(command)) {
            // repurpose the admin login prompt as an alternate way to access password auth
            case 2:
                const driver = ctx.gw.getAuthStrategy("legacy");
                if (driver == null) {
                    // if simple auth is disabled, there's really not much we can do
                    ctx.send("chat", "", "Legacy password auth is disabled on this server.");
                    return;
                }
                const identity = await driver.identify(data);
                if (identity != null) {
                    if (ctx.level >= 1) {
                        ctx.send("auth", AUTH_SESSION, ctx.gw.xbt.issue(identity.strategy, identity.id));
                    }
                    ctx.setIdentity(identity);
                }
                break;
        }
        // TODO: maybe implement collabvm's other horrifying admin commands
    },


    // V1 extensions

    // declare protocol extension support
    extend(ctx, magic: wirestr, level: wirenum) {
        magic = ensureString(magic);
        if (magic != "lucid") return;
        level = ensureNumber(level);
        ctx.level = level;
    },

    // upgrade to a different event conduit
    upgrade(ctx, target: wirestr) {
        var next: EventConduit;
        switch (ensureString(target)) {
            case "guac":
                next = new GuacConduit();
                break;
            case "json":
                next = new JSONConduit();
                break;
            case "lec":
                next = new LECConduit(Codebooks.CVMP);
                break;
            default:
                ctx.send("upgrade", false);
                return;
        }
        ctx.send("upgrade", true, target);
        ctx.conduit = next;
    },

    // authentication handshake
    async auth(ctx, stage: wirenum, data: wirestr) {
        stage = ensureNumber(stage);
        switch (stage) {
            case AUTH_ADVERTISE:
                ctx.send("auth", AUTH_ADVERTISE, ctx.gw.authMandate, ...ctx.gw.getAuthStrategies());
                break;
            case AUTH_USE: {
                const driver = ctx.gw.getAuthStrategy(data);
                if (driver == null) {
                    ctx.send("auth", AUTH_NONSENSE);
                    return;
                }
                ctx.strategy = data;
                ctx.send("auth", AUTH_USE, data, ...driver.useDriver());
                break;
            }
            case AUTH_IDENTIFY: {
                const driver = ctx.gw.getAuthStrategy(ctx.strategy);
                // sanity check
                if (driver == null) {
                    ctx.send("auth", AUTH_REJECT);
                    return;
                }
                const identity = await driver.identify(data);
                if (identity == null) {
                    ctx.send("auth", AUTH_REJECT);
                    return;
                }
                ctx.send("auth", AUTH_IDENTIFY);
                ctx.send("auth", AUTH_SESSION, ctx.gw.xbt.issue(identity.strategy, identity.id));
                ctx.setIdentity(identity);
                break;
            }
            case AUTH_SESSION: {
                // TODO: fencepost, so tokens can actually be revoked
                const claims = await ctx.gw.xbt.getClaims(data, null);
                if (claims == null) {
                    ctx.send("auth", AUTH_STALE);
                    return;
                }
                const [strategy, id] = claims;
                const driver = ctx.gw.getAuthStrategy(strategy);
                if (driver == null) {
                    ctx.send("auth", AUTH_STALE);
                    return;
                }
                const identity = await driver.getIdentity(id);
                if (identity == null) {
                    ctx.send("auth", AUTH_STALE);
                    return;
                }
                ctx.send("auth", AUTH_IDENTIFY);
                ctx.setIdentity(identity);
                break;
            }
        }
    },

    // enable or disable sanitizing strings serverside
    // TODO: currently does nothing, needs quite a bit of reworking to implement
    strip(ctx, enable: boolean) {
        ctx.strip = enable;
        ctx.send("strip", enable);
    }

};