import { Entity, Column, PrimaryColumn } from "typeorm";

import type { MachineConfig } from "../../controller/machine";

@Entity()
export class Machine implements MachineConfig {

    // channel to bind to
    @PrimaryColumn()
    channel: string;

    // uri of the hypervisor monitor's websocket
    @Column()
    monitorAddress: string;

    // display name
    @Column({ default: "Unnamed VM" })
    displayName: string;

    // motd to show upon connecting to this machine
    @Column({ default: "Welcome to LucidVM!" })
    motd: string;


    @Column({ default: true })
    canTurn: boolean;

    @Column({ default: 20 })
    turnDuration: number;

    @Column({ default: true })
    canVote: boolean;

    @Column({ default: 60 })
    voteDuration: number;

    @Column({ default: 300 })
    voteCooldown: number;

    @Column({ default: false })
    canUpload: boolean;

    @Column({ default: 120 })
    uploadCooldown: number;


    @Column({ default: false })
    announceJoinPart: boolean;

    @Column({ default: false })
    announceNick: boolean;

    @Column({ default: true })
    announceVote: boolean;

    @Column({ default: false })
    announceVoters: boolean;

    @Column({ default: true })
    announceUpload: boolean;

}