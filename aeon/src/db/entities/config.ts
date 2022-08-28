// aeon: an enhanced reimplementation of the CollabVM server
// Copyright (C) 2022 dither
// SPDX-License-Identifier: AGPL-3.0-only

import { Entity, Column, PrimaryColumn } from "typeorm";

@Entity()
export class ConfigOption {

    // the configuration option
    @PrimaryColumn()
    id: string;

    // its value
    @Column({ nullable: true })
    value: string;

}