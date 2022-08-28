// aeon: an enhanced reimplementation of the CollabVM server
// Copyright (C) 2022 dither
// SPDX-License-Identifier: AGPL-3.0-only

import path from "path";

import { ensureBoolean, ensureNumber, GatewayCap } from "@lucidvm/shared";

import { DatabaseConfig, ConfigKey } from "./config";
import { initDatabase, Quote } from "./db";
import { EventGateway, registerPrivateExtension } from "./gateway";
import { MachineManager } from "./manager";
import { LocalDriver, SimplePasswordDriver, AuthCap, AuthManager, InternalDriver } from "./auth";
import { mountWebapp, mountAPI } from "./routes";
import { registerAdminCommands } from "./commands";
import { Logger } from "./logger";

const logger = new Logger("main");

logger.print("starting event gateway...!");

// fire up the db
initDatabase().then(async db => {
    // register qotd extension
    const quotes = db.getRepository(Quote);
    registerPrivateExtension(GatewayCap.QOTD, {
        qotd: {
            requires: AuthCap.None,
            async invoke(ctx) {
                const all = await quotes.find();
                if (all.length < 1) {
                    ctx.send("qotd", "");
                    return;
                }
                ctx.send("qotd", all[Math.floor(Math.random() * all.length)].text);
            }
        }
    });

    // create managers
    const config = new DatabaseConfig(db);
    const auth = new AuthManager(db,
        await config.getOption(ConfigKey.TokenSecret));

    // register auth drivers
    const sys = new InternalDriver();
    await auth.registerDriver(sys);
    const acl = new LocalDriver(db);
    await auth.registerDriver(acl);

    // create root user if it doesnt exist
    if (await acl.users.findOneBy({ username: "root" }) == null) {
        logger.warn("creating default root account with password nebur123");
        await acl.register("root", "nebur123");
        await acl.setUserCaps("root", AuthCap.All);
    }

    // instantiate the gateway
    const gw = new EventGateway(auth, config);

    // instantiate machine manager
    const mchmgr = new MachineManager(gw, db, path.join(__dirname, "..", "vms"));

    // mount additional routes
    mountWebapp(gw);
    mountAPI(gw, config, mchmgr, acl);

    // register legacy driver
    const pwdrv = new SimplePasswordDriver(await config.getOption(ConfigKey.UserPassword));
    config.on(ConfigKey.UserPassword, pw => pwdrv.password = pw);
    await auth.registerDriver(pwdrv);

    // register chat commands
    gw.commands.register({
        name: "xyzzy",
        description: "Say the magic word",
        unlisted: true,
        method(ctx) {
            ctx.author.announce("Nothing happened...");
        }
    });
    registerAdminCommands(gw.commands, mchmgr);

    // start all machines
    mchmgr.startAll();
    
    // start listening
    const host = await config.getOption(ConfigKey.ListenHost);
    const port = ensureNumber(await config.getOption(ConfigKey.ListenPort));
    gw.listen(port, host);

    logger.print("ready!");
});