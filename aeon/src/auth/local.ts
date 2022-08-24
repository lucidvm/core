import { DataSource, Repository } from "typeorm";
import { hash, compare } from "bcrypt";

import { User, Group } from "../db";

import { AuthDriver, ClientIdentity } from "./base";

export class LocalDriver implements AuthDriver {

    readonly id = "local";

    readonly users: Repository<User>;
    readonly groups: Repository<Group>;

    constructor(readonly db: DataSource) {
        this.users = db.getRepository(User);
        this.groups = db.getRepository(Group);
    }

    init() { }

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
            flags: user.mask | user.group.mask,
            fencepost: user.fencepost
        };
    }

    async getIdentity(id: number) {
        const user = await this.users.findOneBy({ id });
        if (user == null) return null;
        return {
            strategy: this.id,
            id: user.id,
            flags: user.mask | user.group.mask,
            fencepost: user.fencepost
        };
    }

    async register(username: string, password: string): Promise<ClientIdentity> {
        // create default group if it doesnt exist
        var group = await this.groups.findOneBy({ name: "default" });
        if (group == null) {
            group = await this.createGroup("default");
        }
        // now actually create the user
        var user = new User();
        user.group = group;
        user.username = username;
        user.password = await hash(password, 10);
        user.fencepost = new Date();
        user = await this.users.save(user);
        return {
            strategy: this.id,
            id: user.id,
            flags: user.mask,
            fencepost: user.fencepost
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

    async setUserMask(username: string, mask: number) {
        await this.users.createQueryBuilder()
            .update({ mask })
            .where({ username })
            .execute();
    }

    createGroup(groupname: string): Promise<Group> {
        const group = new Group();
        group.name = groupname;
        return this.groups.save(group);
    }

    async assignGroup(groupname: string, username: string) {
        const group = await this.groups.findOneBy({ name: groupname });
        await this.users.createQueryBuilder()
            .update({ group })
            .where({ username })
            .execute();
    }

    async setGroupMask(groupname: string, mask: number) {
        await this.groups.createQueryBuilder()
            .update({ mask })
            .where({ name: groupname })
            .execute();
    }

}