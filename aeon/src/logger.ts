// aeon: an enhanced reimplementation of the CollabVM server
// Copyright (C) 2022 dither
// SPDX-License-Identifier: AGPL-3.0-only

import chalk from "chalk";

export class Logger {

    constructor(readonly moduleName: string,
        readonly color: "black" | "red" | "green" | "yellow" | "blue" | "magenta" | "cyan" | "white" = "cyan") { }

    private prefix(): string[] {
        return [
            chalk.whiteBright("[" + (new Date()).toLocaleString() + "]"),
            chalk[this.color]("[" + this.moduleName + "]")
        ];
    }

    debug(...str: any[]): void {
        console.debug(...this.prefix(), chalk.blue(...str));
    }
    print(...str: any[]): void {
        console.log(...this.prefix(), ...str);
    }
    warn(...str: any[]): void {
        console.warn(...this.prefix(), chalk.yellowBright(...str));
    }
    error(...str: any[]): void {
        console.error(...this.prefix(), chalk.bgRedBright(chalk.black(...str)));
    }

}
