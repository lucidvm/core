import { wireprim } from "@lucidvm/shared";

enum LegacyRank {
    Anonymous,
    Registered,
    Administrator,
    Moderator,
    Developer
}

export enum Flag {
    // no permissions at all
    None            = 1 << 0,
    // known user
    Registered      = 1 << 1,
    // appears as a registered user in the frontend
    VisibleUser     = 1 << 2,
    // appears as a moderator in the frontend
    VisibleMod      = 1 << 3,
    // appears as a developer in the frontend
    VisibleDev      = 1 << 4, 
    // appears as an administrator in the frontend
    VisibleAdmin    = 1 << 5,

    // allows the user to force-reset the machine
    Reset           = 1 << 6,
    // allows the user to manage snapshots
    Snapshot        = 1 << 7,

    // allows access to the admin api
    API             = 1 << 22,

    // instance root
    God             = 1 << 23,
    // all permissions
    All             = ~(~0 << 24)
}

export interface ClientIdentity {
    get strategy(): string;
    get id(): string | number;
    get flags(): number;
    get fencepost(): Date;
}

export interface AuthDriver {
    get id(): string;
    init(): void | Promise<void>;
    useDriver(): wireprim[];
    getIdentity(id: string | number): ClientIdentity | Promise<ClientIdentity>;
    identify(secret: string): ClientIdentity | Promise<ClientIdentity>;
}

export function hasFlag(flags: number, flag: Flag): boolean {
    if ((flags & Flag.God) === Flag.God) return true;
    return (flags & flag) === flag;
}

export function getLegacyRank(flags: number): LegacyRank {
    if (hasFlag(flags, Flag.VisibleAdmin)) return LegacyRank.Administrator;
    if (hasFlag(flags, Flag.VisibleDev)) return LegacyRank.Developer;
    if (hasFlag(flags, Flag.VisibleMod)) return LegacyRank.Moderator;
    if (hasFlag(flags, Flag.VisibleUser)) return LegacyRank.Registered;
    return LegacyRank.Anonymous;
}