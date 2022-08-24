import { AuthDriver, ClientIdentity, LegacyRank } from "./base";

const fencepost = new Date();

const root = {
    strategy: "legacy",
    id: "root",
    rank: LegacyRank.Administrator,
    fencepost
};
const user = {
    strategy: "legacy",
    id: "user",
    rank: LegacyRank.Registered,
    fencepost
};

export class SimplePasswordDriver implements AuthDriver {

    readonly id = "legacy";

    private passUser: string;
    private passAdmin: string;

    constructor(adminpass: string, userpass: string = null) {
        this.passAdmin = adminpass;
        this.passUser = userpass;
    }

    init() { }

    useDriver() { return []; }

    getIdentity(id: string): ClientIdentity {
        switch (id) {
            case "root":
                return root;
            case "user":
                return user;
        }
        return null;
    }

    identify(secret: string): ClientIdentity {
        if (this.passAdmin != null && secret === this.passAdmin) {
            return root;
        }
        if (this.passUser != null && secret === this.passUser) {
            return user;
        }
        return null;
    }

}