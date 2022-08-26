import { AuthCap, hasCap } from "../auth";
import type { ChannelController } from "../controller";
import type { ClientContext, EventGateway } from "../core";

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

const humanizedbool = {
    "true": true,
    "on": true,
    "yes": true,
    "1": true,

    "false": false,
    "off": false,
    "no": false,
    "0": false
};

type CommandArg = number | string | boolean;

type CommandArgumentType =
    "number" | "string" | "boolean" | "number?" | "string?" | "boolean?";

type CommandUsageArg = [string, CommandArgumentType];

interface CommandContext {
    gw: EventGateway;
    room: ChannelController;
    author: ClientContext;
    message: string;
    rawargs: string;
}

type CommandMethod = (ctx: CommandContext, ...args: CommandArg[]) => void | Promise<void>;

interface CommandDefinition {
    method: CommandMethod;
    name: string;
    alias?: string[];
    description?: string;
    usage?: CommandUsageArg[];
    morehelp?: string;
    unlisted?: boolean;
    stealth?: boolean;
    minargs?: number;
    maxargs?: number;
    minperms?: AuthCap;
}

export interface CommandDefinitionStrict extends CommandDefinition {
    alias: string[];
    description: string;
    usage: CommandUsageArg[];
    morehelp: string;
    unlisted: boolean;
    stealth: boolean;
    minargs: number;
    maxargs: number;
    minperms: AuthCap;
}

const PREFIX = "/";

export class CommandManager {
    readonly commands: Record<string, CommandDefinitionStrict> = {};

    async handleMessage(client: ClientContext, content: string) {
        const prefixed = content.startsWith(PREFIX);

        if (prefixed) {
            try {
                if (prefixed) content = content.substring(PREFIX.length);
                const args: string[] = lex(content);
                const largs: CommandArg[] = [];
                if (args.length <= 0) return;

                const command = args.shift().toLowerCase();
                if (!(command in this.commands)) {
                    throw new Error(`${command}: Command not found`);
                    return;
                }
                const data = this.commands[command];

                if (!hasCap(client.authcaps, data.minperms)) {
                    // stealth commands just return immediately without an error
                    if (data.stealth) {
                        return;
                    }
                    throw new Error(`${command}: Permission denied`);
                }
                if (args.length < data.minargs) {
                    throw new Error(`${command}: Not enough arguments (${data.minargs} needed)`);
                }
                if (data.maxargs > 0 && args.length > data.maxargs) {
                    throw new Error(`${command}: Too many arguments (${data.maxargs} accepted)`);
                }

                if (data.usage.length > 0) {
                    for (var i = 0; i < data.usage.length; i++) {
                        const [name, type] = data.usage[i];
                        const nullable = type.endsWith("?");
                        const arg = args[i];
                        if (arg == null) {
                            if (!nullable) {
                                throw new Error(`${command}: Argument missing (${name})`);
                            }
                            break;
                        }
                        const realtype: CommandArgumentType = nullable
                            ? type.substring(0, type.length - 1) as CommandArgumentType
                            : type;
                        switch (realtype) {
                            case "string":
                                largs.push(arg);
                                continue;
                            case "number":
                                if (isNaN(+arg)) {
                                    throw new Error(`${command}: Incorrect argument type (${name} is ${type})`);
                                }
                                largs.push(+arg);
                                continue;
                            case "boolean":
                                const larg = arg.toLowerCase();
                                if (!(larg in humanizedbool)) {
                                    throw new Error(`${command}: Incorrect argument type (${name} is ${type})`);
                                }
                                largs.push(humanizedbool[larg]);
                                continue;
                        }
                    }
                }

                await data.method({
                    gw: client.gw,
                    room: client.gw.getController(client.channel),
                    author: client,
                    message: content,
                    rawargs: content.trim().substring(command.length + 1).trim(),
                }, ...(largs.length > 0 ? largs : args));
            }
            catch (e) {
                client.announce(e.toString().substring(7));
            }
        }
    }

    register(data: CommandDefinition) {
        const name = data.name.toLowerCase();
        if (name in this.commands) throw new Error("attempt to register " + name + " again");
        var minargs = data.minargs || 0;
        var maxargs = data.maxargs || 0;
        if (data.usage != null && data.usage.length > 0) {
            var sealed = false;
            minargs = 0;
            for (var i = 0; i < data.usage.length; i++) {
                if (data.usage[i][1].endsWith("?")) {
                    if (!sealed) {
                        maxargs = minargs;
                        sealed = true;
                    }
                    maxargs++;
                }
                else {
                    if (sealed) {
                        throw new Error(name + ": non-nullable argument after nullable argument");
                    }
                    minargs++;
                }
            }
        }
        const cmddata = Object.assign({
            alias: [],
            description: "No description provided",
            usage: [],
            morehelp: "No additional information is available for this command",
            unlisted: false,
            stealth: false,
            minargs: 0,
            maxargs: 0,
            minperms: AuthCap.None
        }, data, { minargs, maxargs });
        this.commands[name] = cmddata;
        for (const alias of cmddata.alias) {
            this.commands[alias] = cmddata;
        }
    }
}