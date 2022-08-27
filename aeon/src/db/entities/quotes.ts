// aeon: an enhanced reimplementation of the CollabVM server
// Copyright (C) 2022 dither
// SPDX-License-Identifier: AGPL-3.0-only

import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity()
export class Quote {

    @PrimaryColumn()
    id: string;

    @Column()
    text: string;

}