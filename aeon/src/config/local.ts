// aeon: an enhanced reimplementation of the CollabVM server
// Copyright (C) 2022 dither
// SPDX-License-Identifier: AGPL-3.0-only

import { DataSource, Repository } from "typeorm";

import { bonk, wireprim } from "@lucidvm/shared";

import { ConfigOption } from "../db";
import { ConfigDriver, ConfigKey } from "./base";

export class DatabaseConfig extends ConfigDriver {

    readonly repo: Repository<ConfigOption>;

    constructor(readonly db: DataSource) {
        super();
        this.repo = db.getRepository(ConfigOption);
    }

    protected override async getOptionImpl(id: ConfigKey): Promise<string> {
        return (await this.repo.findOneBy({ id }))?.value;
    }

    protected override async setOptionImpl(id: ConfigKey, value: wireprim): Promise<string> {
        var opt = new ConfigOption();
        opt.id = id;
        opt.value = bonk(value);
        opt = await this.repo.save(opt);
        return opt.value;
    }

}