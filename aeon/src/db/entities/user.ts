import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from "typeorm";

import { Flag } from "../../auth";

import { Group } from "./group";

@Entity()
export class User {

    // numeric id for user, only used for index
    @PrimaryGeneratedColumn()
    id: number;

    // the user's username
    @Column({ unique: true })
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