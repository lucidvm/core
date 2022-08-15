import { AuthDriver, ClientIdentity, UserRank } from "./base";

const root = {
    strategy: "legacy",
    id: "root",
    rank: UserRank.Administrator
};
const user = {
    strategy: "legacy",
    id: "user",
    rank: UserRank.Registered
};

export class SimplePasswordDriver implements AuthDriver {

    readonly id = "legacy";

    private fencepost = new Date();
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

    getFencepost(): Date {
        return this.fencepost;
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