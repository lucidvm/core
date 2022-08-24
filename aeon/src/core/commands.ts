import type { QEMUOptions } from "@lucidvm/virtue";

import { UserRank } from "../auth";
import { BaseMachine, LocalMachine } from "../controller";

import type { ClientContext } from "./client";

export function lex(source: string) {
    const tokens: string[] = [];
    var current: string[] = [];
    for (var i = 0; i < source.length; i++) {
        var c = source[i];
        switch (c) {
            case " ":
            case "\n":
                if (current.length > 0) {
                    tokens.push(current.join(""));
                    current = [];
                }
                break;
            case "\"":
                i++;
                for (; i < source.length && source[i] !== c; i++) {
                    current.push(source[i]);
                }
                tokens.push(current.join(""));
                current = [];
                break;
            default:
                current.push(c);
                break;
        }
    }
    if (current.length > 0) tokens.push(current.join(""));
    return tokens;
}

export const commands: { [key: string]: (ctx: ClientContext, raw: string, ...args: string[]) => void } = {

    xyzzy(ctx) {
        ctx.send("chat", "", "Nothing happened.");
    },

    reset(ctx) {
        if (ctx.rank === UserRank.Administrator) {
            (ctx.gw.getController(ctx.channel) as BaseMachine).reset();
            ctx.send("chat", "", "Administrative reset issued.");
        }
        else ctx.send("chat", "", "No.");
    },

    // FIXME: delete this entire command and make it suck less eventually
    /*async snapshot(ctx) {
        const gw = ctx.gw;
        if (ctx.rank === UserRank.Administrator) {
            try {
                const controller = gw.getController(ctx.channel);
                if (controller instanceof LocalMachine) {
                    const name = "manual-" + Date.now();
                    controller.monitor.snapshot(name);
                    const db = gw.getAuthStrategy("local") as DatabaseDriver;
                    const info = await db.getMachine(ctx.channel);
                    const details: QEMUOptions = JSON.parse(info.details);
                    details.snapshot = name;
                    info.details = JSON.stringify(details);
                    await db.saveMachine(info);
                    ctx.send("chat", "", "Snapshot started.");
                }
                else {
                    ctx.send("chat", "", "This machine is not in-process. Cannot add snapshot.");
                }
            }
            catch (ex) {
                ctx.send("chat", "", ex.toString());
            }
        }
        else ctx.send("chat", "", "No.");
    }*/

};