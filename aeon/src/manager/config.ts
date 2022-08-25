import crypto from "crypto";
import { EventEmitter } from "events";

import { DataSource, Repository } from "typeorm";

import { wireprim, bonk } from "@lucidvm/shared";

import { ConfigOption, ConfigKey } from "../db/entities";

interface OptionMetadata {
    // human-friendly category
    category?: string;
    // human-friendly name for the config item
    name?: string;
    // human-friendly description
    description?: string;
    // should this value be retrievable from the admin api?
    secret?: boolean;
    // should this value be hidden on a graphical frontend?
    hidden?: boolean;
    // the type of this value
    type?: "string" | "number" | "boolean"
    // the default value to use when not defined in the db
    get default(): wireprim;
}

const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const options: Record<ConfigKey, OptionMetadata> = {
    [ConfigKey.ListenHost]: {
        category: "Listen",
        name: "Address",
        description: "Address to listen on",
        default: "127.0.0.1"
    },
    [ConfigKey.ListenPort]: {
        category: "Listen",
        name: "Port",
        description: "Port to listen on",
        type: "number",
        default: 9738
    },
    [ConfigKey.InstanceName]: {
        category: "Instance",
        name: "Name",
        description: "Name of this instance",
        default: "LucidVM"
    },
    [ConfigKey.InstanceSysop]: {
        category: "Instance",
        name: "Sysop",
        description: "Instance admin's name or handle",
        default: "N/A"
    },
    [ConfigKey.InstanceContact]: {
        category: "Instance",
        name: "Contact",
        description: "Admin contact info",
        default: "N/A"
    },
    [ConfigKey.AuthMandatory]: {
        category: "Auth",
        name: "Require authentication?",
        description: "Enable this option to force users to authenticate before participating",
        type: "boolean",
        default: false
    },
    [ConfigKey.TokenSecret]: {
        name: "Token secret",
        //description: "Recompute Base Encryption Key Hash",
        description: "Secret value used to sign tokens; you probably don't want to touch this unless the value has somehow leaked to an untrusted party",
        secret: true,
        hidden: true,
        get default() { return [...crypto.randomBytes(64)].map(x => charset[x % charset.length]).join(""); }
    },
    // XXX: UserPassword is not considered a secret, nor hashed
    //      this is deliberate, as it is meant to be shared with others
    //
    //      maybe it should be, but i consider it no more important than
    //      hashing the connect password for a game server...
    //
    //      obviously, user-specific passwords *are* hashed
    [ConfigKey.UserPassword]: {
        category: "Auth",
        name: "User password",
        description: "Password for simple password-only authentication; blank to disable password-only auth",
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
        hidden?: boolean;
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

    isValid(id: ConfigKey): boolean {
        return id in options;
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