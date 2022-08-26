// aeon: an enhanced reimplementation of the CollabVM server
// Copyright (C) 2022 dither
// SPDX-License-Identifier: AGPL-3.0-only

import { DataSource, Repository } from "typeorm";
import { hash, compare } from "bcrypt";

import { User, Group } from "../db";

import { AuthDriver, ClientIdentity, AuthCap } from "./base";

const strategy = "local";

function deriveBits(user: User): number {
    // apply group permissions
    // also strip erroneously applied system perms
    return (user.caps | user.group.caps) & ~AuthCap.System;
}

function deriveIdentity(user: User): ClientIdentity {
    return {
        strategy,
        id: user.username,
        caps: deriveBits(user),
        fencepost: user.fencepost
    };
}

// implements local database-backed auth
export class LocalDriver implements AuthDriver {

    readonly id = strategy;

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

        return deriveIdentity(user);
    }

    async getIdentity(username: string) {
        const user = await this.users.findOneBy({ username });
        if (user == null) return null;
        return deriveIdentity(user);
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
        return deriveIdentity(user);
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

    async setUserCaps(username: string, caps: number) {
        await this.users.createQueryBuilder()
            .update({ caps })
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

    async setGroupCaps(groupname: string, caps: number) {
        await this.groups.createQueryBuilder()
            .update({ caps })
            .where({ name: groupname })
            .execute();
    }

}