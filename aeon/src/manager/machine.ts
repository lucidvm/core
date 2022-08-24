import { EventEmitter } from "events";
import { DataSource, Repository } from "typeorm";

import { Machine } from "../db";

export class MachineManager extends EventEmitter {

    readonly repo: Repository<Machine>;

    constructor(readonly db: DataSource) {
        super();
        this.repo = db.getRepository(Machine);
    }

    getMachine(channel: string): Promise<Machine> {
        return this.repo.findOneBy({ channel });
    }

    getAllMachines(): Promise<Machine[]> {
        return this.repo.find();
    }

    async saveMachine(info: Machine): Promise<void> {
        await this.repo.save(info);
    }

}