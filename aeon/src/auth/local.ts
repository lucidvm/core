import { DataSource, Repository } from "typeorm";
import { hash, compare } from "bcrypt";

import { UserRank } from "../auth";
import { User } from "../db";

import { AuthDriver, ClientIdentity } from "./base";

export class DatabaseDriver implements AuthDriver {

    readonly id = "local";

    readonly repo: Repository<User>;

    constructor(readonly db: DataSource) {
        this.repo = db.getRepository(User);
    }

    init() { }

    useDriver() { return []; }

    async identify(secret: string): Promise<ClientIdentity> {
        const split = secret.indexOf(":");
        if (split === -1) return null;

        const username = secret.substring(0, split);
        const password = secret.substring(split + 1);

        const user = await this.repo.findOneBy({ username });
        if (user == null) return null;
        if (!await compare(password, user.password)) return null;

        return {
            strategy: this.id,
            id: user.id,
            rank: user.rank
        };
    }

    async getIdentity(id: number) {
        const user = await this.repo.findOneBy({ id });
        if (user == null) return null;
        return {
            strategy: this.id,
            id: user.id,
            rank: user.rank
        };
    }

    async getFencepost(id: number) {
        const user = await this.repo.findOneBy({ id });
        if (user == null) return null;
        return user.fencepost;
    }

    async register(username: string, password: string): Promise<ClientIdentity> {
        var user = new User();
        user.username = username;
        user.password = await hash(password, 10);
        user.fencepost = new Date();
        user = await this.repo.save(user);
        return {
            strategy: this.id,
            id: user.id,
            rank: UserRank.Registered
        };
    }

    async setPassword(username: string, password: string) {
        await this.repo.createQueryBuilder()
            .update({
                password: await hash(password, 10),
                fencepost: new Date()
            })
            .where({ username })
            .execute();
    }

    async setRank(username: string, rank: UserRank) {
        await this.repo.createQueryBuilder()
            .update({ rank })
            .where({ username })
            .execute();
    }

}