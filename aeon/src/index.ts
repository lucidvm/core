import { ensureBoolean, ensureNumber } from "@lucidvm/shared";

import { DatabaseDriver, ConfigKey } from "./db";
import { User } from "./db/entities";
import { EventGateway } from "./core";
import { SimplePasswordDriver, UserRank } from "./auth";
import { RemoteMachine } from "./controller";
import { mountWebapp } from "./routes";

// fire up the db
const db = new DatabaseDriver();
db.init().then(async () => {
    // create root user if it doesnt exist
    if (await db.db.getRepository(User).findOneBy({ username: "root" }) == null) {
        console.log("creating default root account with password nebur123");
        await db.register("root", "nebur123");
        await db.setRank("root", UserRank.Administrator);
    }

    // instantiate the gateway and register the db as an auth driver
    const gw = new EventGateway(
        await db.getOption(ConfigKey.TokenSecret),
        ensureBoolean(await db.getOption(ConfigKey.AuthMandatory))
    );
    await gw.registerAuthDriver(db);

    // mount additional routes
    mountWebapp(gw.express);

    // register legacy driver if needed
    if (await db.getOption(ConfigKey.LegacyAuth)) {
        await gw.registerAuthDriver(new SimplePasswordDriver(
            await db.getOption(ConfigKey.MasterPassword),
            await db.getOption(ConfigKey.UserPassword)
        ));
    }

    // register machines
    const machines = await db.getAllMachines();
    for (const info of machines) {
        console.log("adding " + info.channel);
        const machine = new RemoteMachine(gw, info.channel, info.monitorAddress);
        machine.loadConfig(info);
        gw.registerController(machine);
    }
    
    // start listening
    const host = await db.getOption(ConfigKey.ListenHost);
    const port = ensureNumber(await db.getOption(ConfigKey.ListenPort));
    gw.listen(port, host);
});