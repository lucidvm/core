// aeon: an enhanced reimplementation of the CollabVM server
// Copyright (C) 2022 dither
// SPDX-License-Identifier: AGPL-3.0-only

import { wireprim } from "@lucidvm/shared";

enum LegacyRank {
    Anonymous,
    Registered,
    Administrator,
    Moderator,
    Developer
}

export enum AuthCap {
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

    // can always take a turn
    TurnOverride    = 1 << 6,
    // can always upload a file
    UploadOverride  = 1 << 8,

    // can see/connect to protected machines
    SeeProtected    = 1 << 9,
    // can see/connect to internal machines
    SeeInternal     = 1 << 10,
    // can see just about everything
    Auspex          = 1 << 11,

    // allows the user to force-reset a machine
    Reset           = 1 << 12,
    // allows the user to manage snapshots
    Snapshot        = 1 << 13,

    // can generate invite tokens
    Invite          = 1 << 19,
    // can generate password reset tokens for any user
    ResetPassword   = 1 << 20,

    // special cap for invite tokens
    Register        = 1 << 21,
    // special cap for password reset tokens
    SetPassword     = 1 << 22,

    // allows access to the api
    API             = 1 << 23,
    // allows modifying global config values
    Config          = 1 << 24,
    // create/destroy machines
    ManageVMs       = 1 << 25,
    // alter room config
    ManageRooms     = 1 << 26,
    // add/remove users, and assign them to groups
    ManageUsers     = 1 << 27,
    // allows creating groups
    ManageGroups    = 1 << 28,
    // allows altering caps on users and groups
    ManagePrivs     = 1 << 29,

    // instance root, overrides immunity check
    Wheel           = 1 << 30,

    // all special permissions
    System          = AuthCap.Register | AuthCap.ResetPassword,
    // all user permissions
    All             = ~(~0 << 31) & ~System,
}

export interface ClientIdentity {
    get strategy(): string;
    get id(): string | number;
    get caps(): number;
    get fencepost(): Date;
}

export interface AuthDriver {
    get id(): string;
    init(): void | Promise<void>;
    useDriver(): wireprim[];
    getIdentity(id: string | number): ClientIdentity | Promise<ClientIdentity>;
    identify(secret: string): ClientIdentity | Promise<ClientIdentity>;
}

export function hasCap(caps: number, cap: AuthCap): boolean {
    if ((caps & AuthCap.Wheel) === AuthCap.Wheel) return true;
    return (caps & cap) === cap;
}

export function isImmune(to: number, target: number): boolean {
    // no one is immune to wheels except the system
    if (hasCap(to, AuthCap.Wheel)) return false;
    // if the target possesses a cap the source doesnt, they are immune
    return (to & target) !== to;
}

export function getLegacyRank(caps: number): LegacyRank {
    if (hasCap(caps, AuthCap.VisibleAdmin)) return LegacyRank.Administrator;
    if (hasCap(caps, AuthCap.VisibleDev)) return LegacyRank.Developer;
    if (hasCap(caps, AuthCap.VisibleMod)) return LegacyRank.Moderator;
    if (hasCap(caps, AuthCap.VisibleUser)) return LegacyRank.Registered;
    return LegacyRank.Anonymous;
}