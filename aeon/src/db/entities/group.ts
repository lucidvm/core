import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from "typeorm";

import { Flag } from "../../auth";

import { User } from "./user";

@Entity()
export class Group {

    // numeric id for group
    @PrimaryGeneratedColumn()
    id: number;

    // the group's name
    @Column({ unique: true })
    name: string;

    // additive permission mask for group
    @Column({ default: Flag.None })
    mask: number;

    // group members
    @OneToMany(() => User, user => user.group)
    users: User[];

}