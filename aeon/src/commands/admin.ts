// aeon: an enhanced reimplementation of the CollabVM server
// Copyright (C) 2022 dither
// SPDX-License-Identifier: AGPL-3.0-only

import { AuthCap } from "../auth";

import { BaseMachine, LocalMachine } from "../controller";
import { Logger } from "../logger";
import type { MachineManager } from "../manager";
import type { CommandManager } from "./handler";

const logger = new Logger("commands:admin");

export function registerAdminCommands(handler: CommandManager, machines: MachineManager) {
    handler.register({
        name: "snapshot",
        description: "Takes a snapshot of the machine's current state and sets it as the rollback target.",
        minperms: AuthCap.Snapshot,
        async method(ctx) {
            if (ctx.room instanceof LocalMachine) {
                const name = "manual-" + Date.now();
                ctx.room.monitor.snapshot(name);
                await machines.setSnapshot(ctx.room.channel, name);
                logger.print(`${ctx} is snapshotting ${ctx.room.channel}`);
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
        minperms: AuthCap.Reset,
        async method(ctx) {
            if (ctx.room instanceof BaseMachine) {
                ctx.room.reset();
                logger.print(`${ctx} has force-reset ${ctx.room.channel}`);
                ctx.author.announce("Machine forcefully reset.");
            }
            else {
                ctx.author.announce("This room is not controlled by a machine.");
            }
        }
    });
}