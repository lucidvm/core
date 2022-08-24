import type { QEMUOptions } from "@lucidvm/virtue";

import { UserRank } from "../auth";
import { BaseMachine, LocalMachine } from "../controller";
import type { MachineManager } from "../manager";
import type { CommandHandler } from "./handler";

export function registerAdminCommands(handler: CommandHandler, machines: MachineManager) {
    handler.register({
        name: "snapshot",
        description: "Takes a snapshot of the machine's current state and sets it as the rollback target.",
        minperms: UserRank.Administrator,
        async method(ctx) {
            if (ctx.room instanceof LocalMachine) {
                const name = "manual-" + Date.now();
                ctx.room.monitor.snapshot(name);
                const info = await machines.getMachine(ctx.room.channel);
                const details: QEMUOptions = JSON.parse(info.details);
                details.snapshot = name;
                info.details = JSON.stringify(details);
                await machines.saveMachine(info);
                ctx.author.announce("Snapshot started.");
            }
            else {
                ctx.author.announce("This machine is not in-process. Cannot snapshot.");
            }
        }
    });
    handler.register({
        name: "reset",
        description: "Resets the machine immediately without a vote.",
        minperms: UserRank.Administrator,
        async method(ctx) {
            if (ctx.room instanceof BaseMachine) {
                ctx.room.reset();
                ctx.author.announce("Machine forcefully reset.");
            }
            else {
                ctx.author.announce("This room is not controlled by a machine.");
            }
        }
    });
}