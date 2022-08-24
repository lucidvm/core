import { Entity, Column, PrimaryGeneratedColumn } from "typeorm";

import { LegacyRank } from "../../auth";

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

    // the user's rank
    // TODO: configurable ranks
    @Column({ default: LegacyRank.Registered })
    rank: LegacyRank;

}