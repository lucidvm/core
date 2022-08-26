// aeon: an enhanced reimplementation of the CollabVM server
// Copyright (C) 2022 dither
// SPDX-License-Identifier: AGPL-3.0-only

import { createHmac } from "crypto";

import ascii85 from "ascii85";
const { ZeroMQ } = ascii85;

import { serialize, deserialize } from "@lucidvm/shared";

const SEP = "~";

type FlatTokenBody<T extends any[]> = [number, number, ...T];
interface TokenBody<T extends any[]> {
    issued: Date,
    expires: Date,
    claims: T
}

function sign(data: Buffer, secret: string): Buffer {
    return createHmac("sha256", secret).update(data).digest();
}

export class XBTCodec<T extends any[]> {
    private secret: string;

    constructor(secret: string) {
        this.secret = secret;
    }

    private encode(token: TokenBody<T>): string {
        const start = Math.floor(token.issued.getTime() / 1000);
        const lifetime = token.expires == null ? null
            : Math.floor(token.expires.getTime() / 1000) - start;

        const bodyflat: FlatTokenBody<T> = [
            start, lifetime,
            ...token.claims
        ];
        const bodybuff = Buffer.from(serialize(bodyflat));

        const signature = sign(bodybuff, this.secret);

        const bodystr = ZeroMQ.encode(bodybuff);
        const signstr = ZeroMQ.encode(signature);

        return `${bodystr}${SEP}${signstr}`;
    }

    private decode(token: string): TokenBody<T> {
        try {
            const parts = token.split(SEP);
            const bodybuff: Buffer = ZeroMQ.decode(parts[0]);
            const signature: Buffer = ZeroMQ.decode(parts[1]);

            if (!sign(bodybuff, this.secret).equals(signature)) {
                return null;
            }

            const bodyflat: FlatTokenBody<T> = deserialize(bodybuff);
            const start = bodyflat.shift() * 1000;
            const issued = new Date(start);
            const lifetime = bodyflat.shift();
            const expires = lifetime == null ? null : lifetime * 1000 + start;

            // die here if the token has expired
            if (expires != null && Date.now() > expires) {
                return null;
            }

            // trust me, i know what im doing (maybe)
            const claims = bodyflat as unknown as T;
            const body: TokenBody<T> = {
                issued,
                expires: new Date(expires),
                claims
            };

            return body;
        }
        catch (e) {
            return null;
        }
    }

    issue(...claims: T): string {
        return this.encode({
            issued: new Date(),
            expires: null,
            claims
        });
    }

    issueTimed(expires: Date, ...claims: T) {
        return this.encode({
            issued: new Date(),
            expires,
            claims
        });
    }

    getExpiry(token: string): Date {
        return this.decode(token)?.expires;
    }

    getDate(token: string): Date {
        return this.decode(token)?.issued;
    }

    getClaims(token: string): T {
        return this.decode(token)?.claims;
    }
}
