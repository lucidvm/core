// aeon: an enhanced reimplementation of the CollabVM server
// Copyright (C) 2022 dither
// SPDX-License-Identifier: AGPL-3.0-only

import { Entity, Column, OneToMany, PrimaryColumn } from "typeorm";

import { AuthCap } from "../../auth";

import { User } from "./user";

@Entity()
export class Group {

    // the group's name
    @PrimaryColumn()
    name: string;

    // additive caps for group
    @Column({ default: AuthCap.None })
    caps: number;

    // group members
    @OneToMany(() => User, user => user.group)
    users: User[];

}