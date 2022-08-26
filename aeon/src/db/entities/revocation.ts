import { Entity, PrimaryColumn } from "typeorm";

@Entity()
export class Revocation {

    // the token id
    @PrimaryColumn()
    id: string;

}