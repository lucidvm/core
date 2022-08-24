import path from "path";

import { ensureBoolean, ensureNumber } from "@lucidvm/shared";
import type { QEMUOptions } from "@lucidvm/virtue";

import { initDatabase, ConfigKey, User } from "./db";
import { EventGateway } from "./core";
import { ConfigManager, MachineManager } from "./manager";
import { DatabaseDriver, SimplePasswordDriver, UserRank } from "./auth";
import { BaseMachine, RemoteMachine, LocalMachine } from "./controller";
import { mountWebapp } from "./routes";

console.log("starting event gateway...!");

// fire up the db
initDatabase().then(async db => {
    // create managers
    const config = new ConfigManager(db);
    const mchmgr = new MachineManager(db);
    const users = new DatabaseDriver(db);

    // create root user if it doesnt exist
    if (await users.repo.findOneBy({ username: "root" }) == null) {
        console.log("creating default root account with password nebur123");
        await users.register("root", "nebur123");
        await users.setRank("root", UserRank.Administrator);
    }

    // instantiate the gateway and register the db as an auth driver
    const gw = new EventGateway(
        await config.getOption(ConfigKey.TokenSecret),
        ensureBoolean(await config.getOption(ConfigKey.AuthMandatory))
    );
    await gw.registerAuthDriver(users);

    // mount additional routes
    mountWebapp(gw.express);

    // register legacy driver if needed
    if (await config.getOption(ConfigKey.LegacyAuth)) {
        await gw.registerAuthDriver(new SimplePasswordDriver(
            await config.getOption(ConfigKey.MasterPassword),
            await config.getOption(ConfigKey.UserPassword)
        ));
    }

    // register machines
    const machines = await mchmgr.getAllMachines();
    for (const info of machines) {
        console.log("adding " + info.channel);
        var machine: BaseMachine
        if (info.remote) {
            machine = new RemoteMachine(gw, info.channel, info.details);
        }
        else {
            const details: QEMUOptions = JSON.parse(info.details);
            details.root = path.join(__dirname, "..", "vms", info.channel);
            machine = new LocalMachine(gw, info.channel, info.id, details);
        }
        machine.loadConfig(info);
        gw.registerController(machine);
    }
    
    // start listening
    const host = await config.getOption(ConfigKey.ListenHost);
    const port = ensureNumber(await config.getOption(ConfigKey.ListenPort));
    gw.listen(port, host);

    console.debug("ready!");
});