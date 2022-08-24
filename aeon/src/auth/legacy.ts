import { AuthDriver, ClientIdentity, LegacyRank } from "./base";

const fencepost = new Date();

const user = {
    strategy: "legacy",
    id: "user",
    rank: LegacyRank.Registered,
    fencepost
};

export class SimplePasswordDriver implements AuthDriver {

    readonly id = "legacy";

    private passUser: string;

    constructor(userpass: string = null) {
        this.passUser = userpass;
    }

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
        if (this.passUser != null && secret === this.passUser) {
            return user;
        }
        return null;
    }

}