// aeon: an enhanced reimplementation of the CollabVM server
// Copyright (C) 2022 dither
// SPDX-License-Identifier: AGPL-3.0-only

import { Entity, PrimaryColumn } from "typeorm";

@Entity()
export class Revocation {

    // the token id
    @PrimaryColumn()
    id: string;

}