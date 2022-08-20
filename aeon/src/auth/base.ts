export enum UserRank {
    Anonymous,
    Registered,
    Administrator,
    Moderator,      // unused here
    Developer       // unused here
}

export interface ClientIdentity {
    get strategy(): string;
    get id(): string | number;
    get rank(): UserRank;
}

export interface AuthDriver {
    get id(): string;
    init(): void | Promise<void>;
    useDriver(): any[];
    getIdentity(id: string | number): ClientIdentity | Promise<ClientIdentity>;
    getFencepost(id: string | number): Date | Promise<Date>;
    identify(secret: string): ClientIdentity | Promise<ClientIdentity>;
}