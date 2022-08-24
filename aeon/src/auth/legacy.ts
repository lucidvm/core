import { AuthDriver, ClientIdentity, Flag } from "./base";

const fencepost = new Date();

const user = {
    strategy: "legacy",
    id: "user",
    flags: Flag.Registered | Flag.VisibleUser,
    fencepost
};

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
        if (this.password != null && secret === this.password) {
            return user;
        }
        return null;
    }

}