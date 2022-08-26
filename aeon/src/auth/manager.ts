import { DataSource, Repository } from "typeorm";
import { simpleflake } from "simpleflakes";

import { wireprim } from "@lucidvm/shared";

import { Revocation } from "../db";

import { AuthDriver, ClientIdentity, Cap } from "./base";
import { XBTCodec } from "./xbt";

function genID(): string { return simpleflake().toString(36); }

interface ClientClaims extends ClientIdentity {
    tid: string;
    tcaps: number;
}

export class AuthManager {

    private drivers: { [k: string]: AuthDriver } = {};

    // tid, driver, uid, caps
    private readonly xbt: XBTCodec<[string, string, string | number, number]>;

    // token revocation list
    readonly trl: Repository<Revocation>;

    constructor(readonly db: DataSource, secret: string) {
        this.trl = db.getRepository(Revocation);
        this.xbt = new XBTCodec(secret);
    }

    hasStrategy(name: string): boolean {
        return name in this.drivers;
    }

    async registerDriver(driver: AuthDriver) {
        await driver.init();
        this.drivers[driver.id] = driver;
    }

    getStrategies() {
        return Object.keys(this.drivers);
    }

    getStrategy(key: string) {
        return this.drivers[key];
    }

    use(strategy: string): wireprim[] {
        if (!(strategy in this.drivers)) return null;
        const driver = this.drivers[strategy];
        return driver.useDriver();
    }

    async identify(strategy: string, secret: string): Promise<[ClientIdentity, string]> {
        // look up the driver
        if (!(strategy in this.drivers)) return [null, null];
        const driver = this.drivers[strategy];

        // attempt to authenticate against the driver
        const identity = await driver.identify(secret);
        if (identity == null) return [null, null];

        // generate a new token
        const token = this.xbt.issue(genID(),
            identity.strategy, identity.id, identity.caps);
        return [identity, token];
    }

    async validateToken(tok: string): Promise<ClientClaims> {
        // get the issue date
        const issued = this.xbt.getDate(tok);
        if (issued == null) return null;
        
        // read the claims
        const [tid, strategy, id, caps] = this.xbt.getClaims(tok);
        // validate types, make sure the driver is valid
        if (typeof tid !== "string" || typeof strategy !== "string" || typeof caps !== "number") return null;
        if (typeof id !== "string" && typeof id !== "number") return null;
        if (!(strategy in this.drivers)) return null;
        const driver = this.drivers[strategy];

        // start checking trl
        const pr = this.trl.findOneBy({ id: tid });

        // retrieve identity info from the driver
        const identity = await driver.getIdentity(id);
        if (identity == null) return null;
        if (issued < identity.fencepost) return null;

        // check result of trl query
        if (await pr != null) return null;

        // finally return identity info
        return {
            strategy, id,
            caps: identity.caps & caps,
            fencepost: identity.fencepost,
            // include token metadata
            tid, tcaps: caps
        };
    }

    async issue(identity: ClientIdentity, caps: number = Cap.All) {
        return this.xbt.issue(genID(),
            identity.strategy, identity.id, identity.caps & caps);
    }

    async issueTimed(identity: ClientIdentity, exp: Date, caps: number) {
        return this.xbt.issueTimed(exp, genID(),
            identity.strategy, identity.id, identity.caps & caps);
    }

    async subissue(tok: string, caps: number): Promise<string> {
        // cannot subissue a token with an expiry
        const expiry = await this.xbt.getExpiry(tok);
        if (expiry != null) return null;
        // validate the token in full
        const claims = await this.validateToken(tok);
        if (claims == null) return null;
        // mask off subcaps
        const subcaps = claims.caps & caps;
        if (subcaps === claims.caps) {
            return tok;
        }
        // return new token
        return this.xbt.issue(claims.tid,
            claims.strategy, claims.id, subcaps);
    }

    async revoke(tok: string): Promise<void> {
        const claims = await this.validateToken(tok);
        if (claims == null) return;
        const entry = new Revocation();
        entry.id = claims.tid;
        await this.trl.save(entry);
    }

}