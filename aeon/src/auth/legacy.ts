// aeon: an enhanced reimplementation of the CollabVM server
// Copyright (C) 2022 dither
// SPDX-License-Identifier: AGPL-3.0-only

import { AuthDriver, ClientIdentity, AuthCap } from "./base";

const fencepost = new Date();

const user: ClientIdentity = {
    strategy: "legacy",
    id: "user",
    caps: AuthCap.Registered | AuthCap.VisibleUser,
    fencepost
};

// implements password-only auth as used in collabvm 1.2
export class SimplePasswordDriver implements AuthDriver {

    readonly id = "legacy";

    constructor(public password: string = null) { }

    init() { }

    useDriver() { return []; }

    getIdentity(id: string): ClientIdentity {
        switch (id) {
            case "user":
                return user;
        }
        return null;
    }

    identify(secret: string): ClientIdentity {
        if (this.password != null && this.password != "" && secret === this.password) {
            return user;
        }
        return null;
    }

}