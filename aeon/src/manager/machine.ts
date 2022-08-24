import path from "path";
import { EventEmitter } from "events";

import { DataSource, Repository } from "typeorm";

import { QEMUOptions } from "@lucidvm/virtue";

import { BaseMachine, LocalMachine, MachineConfig, RemoteMachine } from "../controller";
import { EventGateway } from "../core";
import { Machine } from "../db";

const confkeys: (keyof MachineConfig)[] = [
    "displayName",
    "motd",
    "canTurn",
    "canVote",
    "canUpload",
    "turnDuration",
    "voteDuration",
    "voteCooldown",
    "uploadCooldown",
    "announceJoinPart",
    "announceNick",
    "announceVote",
    "announceVoters",
    "announceUpload"
];

export class MachineManager extends EventEmitter {

    readonly repo: Repository<Machine>;
    private started = false;

    constructor(readonly gw: EventGateway, readonly db: DataSource, readonly root: string) {
        super();
        this.repo = db.getRepository(Machine);
    }

    async startAll() {
        if (this.started) return;
        const machines = await this.repo.find();
        for (const info of machines) {
            this.start(info);
        }
        this.started = true;
    }

    async stopAll() {
        if (!this.started) return;
        for (const machine of this.gw.getControllers()) {
            if (machine instanceof BaseMachine) {
                machine.destroy();
            }
        }
        this.started = false;
    }

    start(info: Machine) {
        if (this.gw.getController(info.channel) != null) {
            throw new Error("channel already has a controller!");
        }
        var machine: BaseMachine;
        if (info.remote) {
            machine = new RemoteMachine(this.gw, info.channel, info.details);
        }
        else {
            const details: QEMUOptions = JSON.parse(info.details);
            details.root = path.join(this.root, info.channel);
            machine = new LocalMachine(this.gw, info.channel, info.id, details);
        }
        machine.loadConfig(info);
        this.gw.registerController(machine);
    }

    async create(channel: string, remote: boolean, details: string) {
        var info = new Machine();
        info.channel = channel;
        info.remote = remote;
        info.details = details;
        info = await this.repo.save(info);
        this.start(info);
    }

    async configure(channel: string, config: MachineConfig) {
        var info = await this.repo.findOneBy({ channel });
        if (info == null) {
            throw new Error("nonexistent machine");
        }
        for (const key of confkeys) {
            const og = info[key];
            const ov = config[key];
            (info[key] as any) = typeof ov === "undefined" ? og : ov;
        }
        const machine = this.gw.getController(channel);
        if (machine instanceof BaseMachine) {
            machine.loadConfig(info);
        }
    }

    async destroy(channel: string) {
        const machine = this.gw.getController(channel);
        if (machine instanceof BaseMachine) {
            machine.destroy();
        }
        await this.repo.delete({ channel });
    }

    async setSnapshot(channel: string, name: string) {
        var info = await this.repo.findOneBy({ channel });
        if (info == null) {
            throw new Error("nonexistent machine");
        }
        const details: QEMUOptions = JSON.parse(info.details);
        details.snapshot = name;
        info.details = JSON.stringify(details);
        await this.repo.save(info);
    }

}