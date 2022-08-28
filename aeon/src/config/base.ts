// aeon: an enhanced reimplementation of the CollabVM server
// Copyright (C) 2022 dither
// SPDX-License-Identifier: AGPL-3.0-only

import { EventEmitter } from "events";
import crypto from "crypto";

import { ensureBoolean, ensureNumber, wireprim } from "@lucidvm/shared";

export enum ConfigKey {
    ListenHost = "gateway.listen.address",
    ListenPort = "gateway.listen.port",

    InstanceName = "gateway.instance.name",
    InstanceSysop = "gateway.instance.sysop",
    InstanceContact = "gateway.instance.contact",

    AuthMandatory = "gateway.auth.required",
    TokenSecret = "gateway.auth.tokenSecret",

    UserPassword = "gateway.auth.legacy.connectPassword",

    MaxSessionsPerIP = "gateway.safety.maxSessionsPerIP",
    CheckVoteIP = "gateway.safety.checkVoteIP"
}

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
    },
    [ConfigKey.MaxSessionsPerIP]: {
        category: "Safety",
        name: "Max active sessions",
        description: "The maximum number of connections that can be opened to a single room, per IP address; set to 0 to allow any number of sessions per IP",
        type: "number",
        default: 1
    },
    [ConfigKey.CheckVoteIP]: {
        category: "Safety",
        name: "Limit votes by IP address",
        description: "Disable to allow more than one vote per IP address",
        type: "boolean",
        default: true
    }
};

export abstract class ConfigDriver extends EventEmitter {

    private readonly cache: Map<string, string> = new Map();

    constructor() {
        super();
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

    protected abstract getOptionImpl(id: ConfigKey): Promise<string> | string;
    async getOption(id: ConfigKey): Promise<string> {
        if (!(id in options)) {
            throw new Error("invalid config key specified");
        }
        if (id in this.cache) return this.cache[id];
        return await this.getOptionImpl(id) ?? await this.setOption(id, options[id].default)
    }
    async getOptionBool(id: ConfigKey): Promise<boolean> { return ensureBoolean(await this.getOption(id)); }
    async getOptionNum(id: ConfigKey): Promise<number> { return ensureNumber(await this.getOption(id)); }

    protected abstract setOptionImpl(id: ConfigKey, value: wireprim): Promise<string> | string;
    async setOption(id: ConfigKey, value: wireprim): Promise<string> {
        if (!(id in options)) {
            throw new Error("invalid config key specified");
        }
        value = await this.setOptionImpl(id, value);
        this.cache[id] = value;
        this.emit(id, value);
        return value;
    }

}

export class DummyConfig extends ConfigDriver {
    protected override getOptionImpl() { return null; }
    protected override setOptionImpl() { return null; }
}