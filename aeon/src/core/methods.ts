import he from "he";

import {
    Codebooks,
    EventConduit, GuacConduit, JSONConduit, LECConduit,
    wireprim, wirestr, wirenum, wirebool,
    ensureString, ensureNumber, ensureBoolean, 
} from "@lucidvm/shared";

import type { ClientContext } from "./client";

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
        ctx.sendPeers(peers);
        ctx.gw.announcePeer(ctx);
    },

    disconnect(ctx, internal: wirebool) {
        const chan = ctx.channel;
        if (chan != null) {
            ctx.gw.getController(chan)?.notifyPart(ctx);
            ctx.gw.announcePeer(ctx, true);
        }
        ctx.channel = null;
        if (!internal) {
            ctx.send("connect", 2);
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
        if (nick == null) {
            nick = ctx.guestify();
        }

        // very lazily block things that trigger html escaping
        if (nick !== he.escape(nick)) {
            ctx.sendRename(ctx.nick, RENAME_INVALID);
            return;
        }

        const oldnick = ctx.nick;

        if (ctx.channel != null) {
            if (ctx.gw.nickInUse(ctx.channel, nick)) {
                ctx.sendRename(ctx.nick, RENAME_INUSE);
                return;
            }
            ctx.nick = nick;
            ctx.sendRename(nick, RENAME_OK);
            // workaround for vanilla 1.2 frontend bug related to losing visible rank on rename
            ctx.sendPeers([ctx]);
        }
        else {
            ctx.nick = nick;
            ctx.sendRename(nick, RENAME_OK);
        }

        ctx.gw.announceRename(ctx, oldnick);
        ctx.gw.getController(ctx.channel)?.notifyNick(ctx, oldnick);
    },

    chat(ctx, text: wirestr) {
        if (ctx.channel == null) return;

        // XXX: messy
        if (text.startsWith("//")) {
            text = text.substring(1);
        }
        else if (text.startsWith("/")) {
            ctx.gw.commands.handleMessage(ctx, text);
            return;
        }

        text = ensureString(text);
        ctx.gw.sendChat(ctx, text);
    },

    async admin(ctx, command: wirenum, data: wirestr) {
        switch (ensureNumber(command)) {
            // repurpose the admin login prompt as an alternate way to access password auth
            case 2:
                const driver = ctx.gw.getAuthStrategy("legacy");
                if (driver == null) {
                    // if simple auth is disabled, there's really not much we can do
                    ctx.announce("Legacy password auth is disabled on this server.");
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


    // lucid-1 extensions

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
            case "lec.disable":
                next = new LECConduit(Codebooks.CVMP);
                break;
            default:
                ctx.send("upgrade", false);
                return;
        }
        ctx.send("upgrade", true, target);
        ctx.conduit = next;
    },

    // retrieve the LEC codebook for this session
    codebook(ctx) {
        if (ctx.conduit instanceof LECConduit) {
            ctx.send("codebook", ...ctx.conduit.dumpCodebook());
        }
        else {
            // send an empty codebook if we arent using LEC
            ctx.send("codebook");
        }
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

    // retrieve information about this instance
    instance(ctx) {
        // software, version, instance name, instance maintainer, instance contact details
        // TODO: implement properly
        ctx.send("instance", "LucidVM", "0.1.0-dev", "unset", "unset", "unset");
    },

    // enable or disable sanitizing strings serverside
    strip(ctx, enable: boolean) {
        ctx.strip = ensureBoolean(enable);
        ctx.send("strip", enable);
    },

};