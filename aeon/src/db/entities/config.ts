import { Entity, Column, PrimaryColumn } from "typeorm";

export enum ConfigKey {
    ListenHost = "gateway.listen.address",
    ListenPort = "gateway.listen.port",

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