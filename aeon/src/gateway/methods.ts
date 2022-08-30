// aeon: an enhanced reimplementation of the CollabVM server
// Copyright (C) 2022 dither
// SPDX-License-Identifier: AGPL-3.0-only

import process from "process";

import he from "he";

import {
    Codebooks,
    EventConduit, JSONConduit, LECConduit,
    wirestr, wirenum, wirebool,
    ensureString, ensureNumber,
    GatewayCap
} from "@lucidvm/shared";

import { AuthCap } from "../auth";
import { Logger } from "../logger";
import { ConfigKey } from "../config";

import type { DispatchTable, DispatchMethod, DispatchEntry } from "./client";

const logger = new Logger("dispatch:base");

const RENAME_OK = 0;
const RENAME_INUSE = 1;
const RENAME_INVALID = 2;
const RENAME_BADWORD = 3;

const CAP_ADVERTISE = 0;
const CAP_USE = 1;
const CAP_REJECT = 2;

const AUTH_ADVERTISE = 0;
const AUTH_USE = 1;
const AUTH_IDENTIFY = 2;
const AUTH_SESSION = 3;
const AUTH_REJECT = 4;
const AUTH_NONSENSE = 5;
const AUTH_STALE = 6;

function normal(invoke: DispatchMethod): DispatchEntry {
    return { invoke };
}
function noauth(invoke: DispatchMethod): DispatchEntry {
    return {
        requires: AuthCap.None,
        invoke
    };
}

export const capTables: Record<string, DispatchTable> = {
    [GatewayCap.LECTunnel]: {
        codebook: noauth(ctx => {
            if (ctx.conduit instanceof LECConduit) {
                ctx.send("codebook", ...ctx.conduit.dumpCodebook());
            }
            else {
                // send an empty codebook if we arent using LEC
                ctx.send("codebook");
            }
        })
    },
    [GatewayCap.Auth]: {
        auth: noauth(async (ctx, stage: wirenum, data: wirestr) => {
            stage = ensureNumber(stage);
            switch (stage) {
                case AUTH_ADVERTISE:
                    ctx.send("auth", AUTH_ADVERTISE,
                        await ctx.gw.config.getOptionBool(ConfigKey.AuthMandatory),
                        ...ctx.gw.auth.getStrategies().filter(x => x !== "internal"));
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
                        logger.warn(`${ctx} failed to authenticate`);
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
        })
    },
    [GatewayCap.Instance]: {
        instance: noauth(async ctx => {
            // software, version, instance name, instance maintainer, instance contact details
            const name = await ctx.gw.config.getOption(ConfigKey.InstanceName);
            const sysop = await ctx.gw.config.getOption(ConfigKey.InstanceSysop);
            const contact = await ctx.gw.config.getOption(ConfigKey.InstanceContact);
            ctx.send("instance", "LucidVM", process.env["npm_package_version"] ?? "0.0.0-unknown", name, sysop, contact);
        })
    },
    [GatewayCap.Routes]: {
        routes: noauth(ctx => {
            // TODO: make this dynamic
            const routes: { [key: string]: string; } = {
                "file": "/upload",
                "lucid:api": "/api",
                "lucid:hurl": "/audio",
                "client:satori": "/",
                "client:flashback": "/flashback"
            };
            const entries = Object.entries(routes);
            ctx.send("routes", entries.length, ...entries.flat());
        })
    }
};

export const baseMethods: DispatchTable = {

    nop: noauth(() => { }),

    connect: noauth(async (ctx, channel: wirestr) => {
        if (channel == null) return;

        // reject connect if too many connections already
        const ipmax = await ctx.gw.config.getOptionNum(ConfigKey.MaxSessionsPerIP);
        if (ipmax > 0) {
            const clones = ctx.gw.getChannelClients(channel).filter(x => x.ip === ctx.ip);
            if (clones.length >= ipmax) {
                logger.warn(`${ctx} tried to join ${channel}, but is already holding ${clones.length} other session(s)`);
                ctx.send("connect", 0);
                return;
            }
        }

        // get controller, reject connect if no controller or not permitted
        const controller = ctx.gw.getController(channel);
        if (controller == null || !controller.canUse(ctx)) {
            if (controller != null) {
                logger.warn(`${ctx} tried to join ${channel}, but was declined by the controller`);
            }
            else {
                logger.warn(`${ctx} tried to join ${channel}, but the room is currently in anarchy`);
            }
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
    }),

    disconnect: noauth((ctx, internal: wirebool) => {
        const chan = ctx.channel;
        if (chan != null) {
            ctx.gw.getController(chan)?.notifyPart(ctx);
            ctx.gw.announcePeer(ctx, true);
        }
        ctx.channel = null;
        if (!internal) {
            ctx.send("connect", 2);
        }
    }),

    list: noauth(ctx => {
        ctx.sendList(
            ctx.gw.getControllers().filter(x => x.canUse(ctx)).map(x => ({
                id: x.channel,
                name: x.displayName,
                thumbnail: x.getThumbnail()
            }))
        );
    }),

    rename: noauth((ctx, nick: wirestr) => {
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
    }),

    chat: normal((ctx, text: wirestr) => {
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
    }),

    admin: noauth(async (ctx, command: wirenum, data: wirestr) => {
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
                    if (ctx.gwcaps[GatewayCap.Auth]) {
                        ctx.send("auth", AUTH_SESSION, token);
                    }
                    ctx.setIdentity(identity);
                }
                break;
        }
        // TODO: maybe implement collabvm's other horrifying admin commands
    }),

    // lucidvm capability handshake

    cap: noauth((ctx, stage: number, ...caps: string[]) => {
        stage = ensureNumber(stage);
        const gwcaps = ctx.gw.getCaps();
        switch (stage) {
            case CAP_USE:
                // reject clients lazily sending back the server's declared caps
                if (caps.indexOf(GatewayCap.Poison) !== -1) {
                    ctx.send("cap", CAP_REJECT, "broken caps implementation");
                    return;
                }
                // make sure no invalid caps are included
                for (const cap of caps) {
                    if (gwcaps.indexOf(cap) === -1) {
                        ctx.send("cap", CAP_REJECT, "invalid cap requested");
                        return;
                    }
                }
                // actually set caps on client
                for (const cap of caps) {
                    // load additional dispatch table entries as needed
                    if (cap in capTables) {
                        ctx.loadDispatchTable(capTables[cap]);
                    }
                    ctx.gwcaps[cap] = true;
                }
                // start upgrade if necessary
                var next: EventConduit = ctx.conduit;
                if (ctx.gwcaps[GatewayCap.LECTunnel]) {
                    next = new LECConduit(Codebooks.CVMP);
                }
                else if (ctx.gwcaps[GatewayCap.JSONTunnel]) {
                    next = new JSONConduit();
                }
                // send caps confirm
                ctx.send("cap", CAP_USE);
                // switch conduit
                ctx.conduit = next;
                break;
        }
    })

};