import crypto from "crypto";
import { EventEmitter } from "events";

import { DataSource, Repository } from "typeorm";

import { wireprim, bonk } from "@lucidvm/shared";

import { ConfigOption, ConfigKey } from "../db/entities";

const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const options: { [key: string]: {
    name?: string;
    description?: string;
    secret?: boolean;
    type?: "string" | "number" | "boolean"
    get default(): wireprim;
} } = {
    [ConfigKey.ListenHost]: {
        name: "Address",
        default: "0.0.0.0"
    },
    [ConfigKey.ListenPort]: {
        name: "Port",
        type: "number",
        default: 9738
    },
    [ConfigKey.AuthMandatory]: {
        name: "Require authentication?",
        type: "boolean",
        default: false
    },
    [ConfigKey.TokenSecret]: {
        name: "Token secret",
        secret: true,
        get default() { return [...crypto.randomBytes(64)].map(x => charset[x % charset.length]).join(""); }
    },
    [ConfigKey.LegacyAuth]: {
        name: "Enabled",
        type: "boolean",
        default: true
    },
    [ConfigKey.UserPassword]: {
        name: "User password",
        default: "hunter2"
    }
};

export class ConfigManager extends EventEmitter {

    readonly repo: Repository<ConfigOption>;

    constructor(readonly db: DataSource) {
        super();
        this.repo = db.getRepository(ConfigOption);
    }

    getConfigMetadata(): {
        id: string;
        name?: string;
        description?: string;
        secret?: boolean;
        type?: "string" | "number" | "boolean"
    }[] {
        return Object.entries(options).map(x => ({
            id: x[0],
            name: x[1].name,
            description: x[1].description,
            secret: x[1].secret,
            type: x[1].type
        }));
    }

    async getOption(id: ConfigKey): Promise<string> {
        if (!(id in options)) {
            throw new Error("invalid config key accessed, this is a bug");
        }
        var opt = await this.repo.findOneBy({ id });
        if (opt == null) {
            opt = new ConfigOption();
            opt.id = id;
            opt.value = bonk(options[id].default);
            await this.repo.save(opt);
        }
        return opt.value;
    }

    async setOption(id: ConfigKey, value: wireprim): Promise<void> {
        if (!(id in options)) {
            throw new Error("invalid config key specified");
        }
        const opt = new ConfigOption();
        opt.id = id;
        opt.value = bonk(value);
        await this.repo.save(opt);
        this.emit(id, value);
        return;
    }

}