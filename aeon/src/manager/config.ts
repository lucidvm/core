import crypto from "crypto";
import { EventEmitter } from "events";

import { DataSource, Repository } from "typeorm";

import { wireprim, bonk } from "@lucidvm/shared";

import { ConfigOption, ConfigKey } from "../db/entities";

interface OptionMetadata {
    // human-friendly name for the config item
    name?: string;
    // human-friendly description
    description?: string;
    // should this value be retrievable from the admin api?
    secret?: boolean;
    // the type of this value
    type?: "string" | "number" | "boolean"
    // the default value to use when not defined in the db
    get default(): wireprim;
}

const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const options: Record<ConfigKey, OptionMetadata> = {
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
    // XXX: UserPassword is not considered a secret, nor hashed
    //      this is deliberate, as it is meant to be shared with others
    //
    //      maybe it should be, but i consider it no more important than
    //      hashing the connect password for a game server...
    //
    //      user-specific passwords *are* hashed
    [ConfigKey.UserPassword]: {
        name: "User password",
        default: "hunter2"
    }
};

export class ConfigManager extends EventEmitter {

    private readonly cache: { [key: string]: string; } = {};

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

    isSecret(id: ConfigKey): boolean {
        if (!(id in options)) {
            throw new Error("invalid config key specified");
        }
        return !!options[id].secret;
    }

    async getOption(id: ConfigKey): Promise<string> {
        if (!(id in options)) {
            throw new Error("invalid config key specified");
        }
        if (id in this.cache) return this.cache[id];
        var val: string;
        var opt = await this.repo.findOneBy({ id });
        if (opt == null) {
            val = await this.setOption(id, options[id].default);
        }
        else {
            val = opt.value;
        }
        return val;
    }

    async setOption(id: ConfigKey, value: wireprim): Promise<string> {
        if (!(id in options)) {
            throw new Error("invalid config key specified");
        }
        var opt = new ConfigOption();
        opt.id = id;
        opt.value = bonk(value);
        opt = await this.repo.save(opt);
        this.cache[id] = opt.value;
        this.emit(id, value);
        return opt.value;
    }

}