import { AuthDriver, ClientIdentity, Cap } from "./base";

const strategy = "internal";
const id = "system";

// implements the system principle used to sign special-purpose tokens
export class InternalDriver implements AuthDriver {

    readonly id = strategy;
    readonly identity: ClientIdentity = {
        strategy, id,
        caps: Cap.System,
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