import { wireprim } from "@lucidvm/shared";

import type { AuthDriver, ClientIdentity } from "./base";
import { XBTCodec } from "./xbt";

export class AuthManager {

    private drivers: { [k: string]: AuthDriver } = {};

    private readonly xbt: XBTCodec<[string, string | number]>;

    constructor(secret: string) {
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
        if (!(strategy in this.drivers)) return [null, null];
        const driver = this.drivers[strategy];
        const identity = await driver.identify(secret);
        if (identity == null) return [null, null];
        const token = this.xbt.issue(identity.strategy, identity.id);
        return [identity, token];
    }

    async validateToken(tok: string): Promise<ClientIdentity> {
        const issued = this.xbt.getDate(tok);
        if (issued == null) return null;
        const [strategy, id] = this.xbt.getClaims(tok);
        if (!(strategy in this.drivers)) return null;
        const driver = this.drivers[strategy];
        const identity = await driver.getIdentity(id);
        if (identity == null) return null;
        if (issued < identity.fencepost) return null;
        return identity;
    }

}