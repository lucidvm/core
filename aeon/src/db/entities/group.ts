import { Entity, Column, OneToMany, PrimaryColumn } from "typeorm";

import { Flag } from "../../auth";

import { User } from "./user";

@Entity()
export class Group {

    // the group's name
    @PrimaryColumn()
    name: string;

    // additive permission mask for group
    @Column({ default: Flag.None })
    mask: number;

    // group members
    @OneToMany(() => User, user => user.group)
    users: User[];

}