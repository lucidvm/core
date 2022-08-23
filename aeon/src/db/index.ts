import crypto from "crypto";
import path from "path";

import { DataSource, Repository } from "typeorm";
import { hash, compare } from "bcrypt";

import { wireprim, ensureString } from "@lucidvm/shared";

import { AuthDriver, ClientIdentity, UserRank } from "../auth";

import { User, Machine, ConfigOption, ConfigKey } from "./entities";

const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// default config values
const defaultValues: Record<ConfigKey, () => string> = [
    () => "0.0.0.0",
    () => "9738",

    () => "0",
    // XXX: probably not ideal?
    () => [...crypto.randomBytes(64)].map(x => charset[x % charset.length]).join(""),
    () => "1",

    () => null,
    () => "hunter2",

    () => null
];

export class DatabaseDriver implements AuthDriver {

    readonly id = "local";

    readonly db: DataSource;

    private config: Repository<ConfigOption>;
    private machines: Repository<Machine>;
    private users: Repository<User>;

    constructor() {
        this.db = new DataSource({
            type: "better-sqlite3",
            database: path.resolve(__dirname, "../..", "aeon.db"),
            entities: [
                ConfigOption,
                Machine,
                User
            ],
            synchronize: true,
            logging: false
        });
    }

    async init() {
        if (this.db.isInitialized) return;
        await this.db.initialize();
        this.config = this.db.getRepository(ConfigOption);
        this.machines = this.db.getRepository(Machine);
        this.users = this.db.getRepository(User);
    }

    async deinit() {
        await this.db.destroy();
    }

    // config keys

    async getOption(id: ConfigKey): Promise<string> {
        if (id >= ConfigKey.NumberOfKeys) {
            throw new Error("invalid config key accessed, this is an error");
        }
        var opt = await this.config.findOneBy({ id });
        if (opt == null) {
            opt = new ConfigOption();
            opt.id = id;
            opt.value = defaultValues[id]();
            await this.config.save(opt);
        }
        return opt.value;
    }

    async setOption(id: ConfigKey, value: wireprim): Promise<void> {
        const opt = new ConfigOption();
        opt.id = id;
        opt.value = ensureString(value);
        await this.config.save(opt);
        return;
    }

    // machine stuff

    getMachine(channel: string): Promise<Machine> {
        return this.machines.findOneBy({ channel });
    }

    getAllMachines(): Promise<Machine[]> {
        return this.machines.find();
    }

    async saveMachine(info: Machine): Promise<void> {
        await this.machines.save(info);
    }

    // authdriver+user management stuff

    useDriver() { return []; }

    async identify(secret: string): Promise<ClientIdentity> {
        const split = secret.indexOf(":");
        if (split === -1) return null;

        const username = secret.substring(0, split);
        const password = secret.substring(split + 1);

        const user = await this.users.findOneBy({ username });
        if (user == null) return null;
        if (!await compare(password, user.password)) return null;

        return {
            strategy: this.id,
            id: user.id,
            rank: user.rank
        };
    }

    async getIdentity(id: number) {
        const user = await this.users.findOneBy({ id });
        if (user == null) return null;
        return {
            strategy: this.id,
            id: user.id,
            rank: user.rank
        };
    }

    async getFencepost(id: number) {
        const user = await this.users.findOneBy({ id });
        if (user == null) return null;
        return user.fencepost;
    }

    async register(username: string, password: string): Promise<ClientIdentity> {
        var user = new User();
        user.username = username;
        user.password = await hash(password, 10);
        user.fencepost = new Date();
        user = await this.users.save(user);
        return {
            strategy: this.id,
            id: user.id,
            rank: UserRank.Registered
        };
    }

    async setPassword(username: string, password: string) {
        await this.users.createQueryBuilder()
            .update({
                password: await hash(password, 10),
                fencepost: new Date()
            })
            .where({ username })
            .execute();
    }

    async setRank(username: string, rank: UserRank) {
        await this.users.createQueryBuilder()
            .update({ rank })
            .where({ username })
            .execute();
    }

}

export { ConfigKey } from "./entities";