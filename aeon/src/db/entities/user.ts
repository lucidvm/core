import { Entity, Column, ManyToOne, PrimaryColumn } from "typeorm";

import { Flag } from "../../auth";

import { Group } from "./group";

@Entity()
export class User {

    // the user's username
    @PrimaryColumn({ unique: true })
    username: string;

    // the user's bcrypt-hashed password
    @Column()
    password: string;

    // token validity fencepost
    @Column()
    fencepost: Date;

    // base permission mask for user
    @Column({ default: Flag.Registered | Flag.VisibleUser })
    mask: number;

    // the user's group
    @ManyToOne(() => Group, group => group.users, { eager: true })
    group: Group;

}