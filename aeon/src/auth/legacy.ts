import { AuthDriver, ClientIdentity, Cap } from "./base";

const fencepost = new Date();

const user: ClientIdentity = {
    strategy: "legacy",
    id: "user",
    caps: Cap.Registered | Cap.VisibleUser,
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