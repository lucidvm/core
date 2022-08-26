// aeon: an enhanced reimplementation of the CollabVM server
// Copyright (C) 2022 dither
// SPDX-License-Identifier: AGPL-3.0-only

import path from "path";

import { DataSource } from "typeorm";

import { User, Machine, ConfigOption, Group, Revocation } from "./entities";

var db: DataSource;

export async function initDatabase(): Promise<DataSource> {
    if (db != null) return db;
    db = new DataSource({
        type: "better-sqlite3",
        database: path.resolve(__dirname, "../..", "aeon.db"),
        entities: [
            ConfigOption,
            Machine,
            User,
            Group,
            Revocation
        ],
        synchronize: true,
        logging: false
    });
    await db.initialize();
    return db;
}

export * from "./entities";