import { Entity, Column, PrimaryColumn } from "typeorm";

export enum ConfigKey {
    // === gateway server settings ===
    ListenHost,
    ListenPort,

    // === core auth support ===
    // auth mandatory? (default = no)
    AuthMandatory,
    // token secret? (default = generate)
    TokenSecret,
    // allow legacy auth? (default = true)
    LegacyAuth,

    // === legacy auth settings ===
    // master password? (default = unset)
    MasterPassword,
    // user password? (default = "hunter2")
    UserPassword,

    // number of keys in this enum, for loop usage
    NumberOfKeys
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