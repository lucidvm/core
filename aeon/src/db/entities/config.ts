// aeon: an enhanced reimplementation of the CollabVM server
// Copyright (C) 2022 dither
// SPDX-License-Identifier: AGPL-3.0-only

import { Entity, Column, PrimaryColumn } from "typeorm";

export enum ConfigKey {
    ListenHost = "gateway.listen.address",
    ListenPort = "gateway.listen.port",

    InstanceName = "gateway.instance.name",
    InstanceSysop = "gateway.instance.sysop",
    InstanceContact = "gateway.instance.contact",

    AuthMandatory = "gateway.auth.required",
    TokenSecret = "gateway.auth.tokenSecret",

    UserPassword = "gateway.auth.legacy.connectPassword"
}

@Entity()
export class ConfigOption {

    // the configuration option
    @PrimaryColumn()
    id: ConfigKey;

    // its value
    @Column({ nullable: true })
    value: string;

}