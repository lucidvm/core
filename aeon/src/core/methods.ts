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

        // get controller, reject connect if no controller or not permitted
        const controller = ctx.gw.getController(channel);
        if (controller == null || !controller.canUse(ctx)) {
            ctx.send("connect", 0);
            return;
        }

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
        controller?.notifyJoin(ctx);

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
            ctx.gw.getControllers().filter(x => x.canUse(ctx)).map(x => ({
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
                if (!ctx.gw.auth.hasStrategy("legacy")) {
                    // if simple auth is disabled, there's really not much we can do
                    ctx.announce("Legacy password auth is disabled on this instance.");
                    return;
                }
                const [identity, token] = await ctx.gw.auth.identify("legacy", data);
                if (identity != null) {
                    if (ctx.level >= 1) {
                        ctx.send("auth", AUTH_SESSION, token);
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
                ctx.send("auth", AUTH_ADVERTISE, ctx.gw.authMandate, ...ctx.gw.auth.getStrategies());
                break;
            case AUTH_USE: {
                const info = ctx.gw.auth.use(data);
                if (info == null) {
                    ctx.send("auth", AUTH_NONSENSE);
                    return;
                }
                ctx.strategy = data;
                ctx.send("auth", AUTH_USE, data, ...info);
                break;
            }
            case AUTH_IDENTIFY: {
                const [identity, token] = await ctx.gw.auth.identify(ctx.strategy, data);
                if (identity == null) {
                    ctx.send("auth", AUTH_REJECT);
                    return;
                }
                ctx.send("auth", AUTH_IDENTIFY);
                ctx.send("auth", AUTH_SESSION, token);
                ctx.setIdentity(identity);
                break;
            }
            case AUTH_SESSION: {
                const identity = await ctx.gw.auth.validateToken(data);
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
    async instance(ctx) {
        // software, version, instance name, instance maintainer, instance contact details
        const info = ctx.gw.instanceInfo;
        ctx.send("instance", "LucidVM", "DEV", info.name, info.sysop, info.contact);
    },

    // enable or disable sanitizing strings serverside
    strip(ctx, enable: boolean) {
        ctx.strip = ensureBoolean(enable);
        ctx.send("strip", enable);
    },

};