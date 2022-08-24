import { wireprim } from "@lucidvm/shared";

export enum LegacyRank {
    Anonymous,
    Registered,
    Administrator,
    Moderator,      // unused here
    Developer       // unused here
}

export interface ClientIdentity {
    get strategy(): string;
    get id(): string | number;
    get rank(): LegacyRank;
    get fencepost(): Date;
}

export interface AuthDriver {
    get id(): string;
    init(): void | Promise<void>;
    useDriver(): wireprim[];
    getIdentity(id: string | number): ClientIdentity | Promise<ClientIdentity>;
    identify(secret: string): ClientIdentity | Promise<ClientIdentity>;
}