import path from "path";

import { ensureBoolean, ensureNumber } from "@lucidvm/shared";
import type { QEMUOptions } from "@lucidvm/virtue";

import { initDatabase, ConfigKey } from "./db";
import { EventGateway } from "./core";
import { ConfigManager, MachineManager } from "./manager";
import { LocalDriver, SimplePasswordDriver, Flag } from "./auth";
import { BaseMachine, RemoteMachine, LocalMachine } from "./controller";
import { mountWebapp, mountAdminAPI } from "./routes";
import { registerAdminCommands } from "./commands";

console.log("starting event gateway...!");

// fire up the db
initDatabase().then(async db => {
    // create managers
    const config = new ConfigManager(db);
    const users = new LocalDriver(db);

    // create root user if it doesnt exist
    if (await users.users.findOneBy({ username: "root" }) == null) {
        console.log("creating default root account with password nebur123");
        await users.register("root", "nebur123");
        await users.setUserMask("root", Flag.All);
    }

    // instantiate the gateway and register the db as an auth driver
    const gw = new EventGateway(
        await config.getOption(ConfigKey.TokenSecret),
        ensureBoolean(await config.getOption(ConfigKey.AuthMandatory))
    );
    config.on(ConfigKey.AuthMandatory, on => gw.authMandate = ensureBoolean(on));
    await gw.auth.registerDriver(users);

    // instantiate machine manager
    const mchmgr = new MachineManager(gw, db, path.join(__dirname, "..", "vms"));

    // mount additional routes
    mountWebapp(gw);
    mountAdminAPI(gw, config, mchmgr);

    // register legacy driver
    const pwdrv = new SimplePasswordDriver(await config.getOption(ConfigKey.UserPassword));
    config.on(ConfigKey.UserPassword, pw => pwdrv.password = pw);
    await gw.auth.registerDriver(pwdrv);

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

    console.debug("ready!");
});