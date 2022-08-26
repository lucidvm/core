// aeon: an enhanced reimplementation of the CollabVM server
// Copyright (C) 2022 dither
// SPDX-License-Identifier: AGPL-3.0-only

import { AuthDriver, ClientIdentity, AuthCap } from "./base";

const strategy = "internal";
const id = "system";

// implements the system principle used to sign special-purpose tokens
export class InternalDriver implements AuthDriver {

    readonly id = strategy;
    readonly identity: ClientIdentity = {
        strategy, id,
        caps: AuthCap.System,
        fencepost: new Date(0)
    }

    constructor() { }

    init() { }

    // decline all attempts to use this driver
    useDriver() { return null; }
    identify() { return null; }

    getIdentity(x: string): ClientIdentity {
        if (x !== id) return null;
        return this.identity;
    }

}