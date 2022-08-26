import { Entity, Column, ManyToOne, PrimaryColumn } from "typeorm";

import { AuthCap } from "../../auth";

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

    // base caps for user
    @Column({ default: AuthCap.Registered | AuthCap.VisibleUser })
    caps: number;

    // the user's group
    @ManyToOne(() => Group, group => group.users, { eager: true })
    group: Group;

}