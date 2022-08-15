import he from "he";

import type { ClientContext } from "./client";

export function lex(source: string) {
    //console.debug(source);
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

    echo(ctx, raw) {
        ctx.send("chat", "", he.escape(raw));
    },

    shrug(ctx, raw) {
        ctx.gw.send(ctx.channel, "chat", ctx.nick, he.escape((raw.length > 0 ? raw + " " : "") + "¯\\_(ツ)_/¯"));
    }

};