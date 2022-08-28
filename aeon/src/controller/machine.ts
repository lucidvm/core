// aeon: an enhanced reimplementation of the CollabVM server
// Copyright (C) 2022 dither
// SPDX-License-Identifier: AGPL-3.0-only

import { Canvas, ImageData } from "canvas";
import he from "he";
import { v4 } from "uuid";
import jpg from "@julusian/jpeg-turbo";

import { ensureBoolean, ensureNumber, ensureString, wireprim } from "@lucidvm/shared";

import { AuthCap, hasCap } from "../auth";
import type { ClientContext, EventGateway } from "../gateway";

import { ChannelController } from "./base";

const LAYER_FB = 0;
const LAYER_PSEUDOCURSOR = 1;

const VOTE_STATUS = 0;
const VOTE_END = 2;
const VOTE_TOOEARLY = 3;

const FILE_TOKEN = 0;
const FILE_SUCCESS = 2;

const THINK_FPS = 30;
const MAX_UPLOAD_NAME = 64;

export enum MachineEvents {
    UserJoin = "join",
    UserPart = "part",
    UserNick = "nick",

    QueueUpdate = "queue",
    FileUpload = "upload",

    VoteBegin = "voteBegin",
    VoteCount = "voteCount",
    VoteSucceed = "voteSucceed",
    VoteFail = "voteFail"
}

export interface MachineConfig {
    displayName: string;
    motd: string;

    canTurn: boolean;
    canVote: boolean;
    canUpload: boolean;

    turnDuration: number;
    voteDuration: number;
    voteCooldown: number;
    uploadCooldown: number;

    announceJoinPart: boolean;
    announceNick: boolean;
    announceVote: boolean;
    announceVoters: boolean;
    announceUpload: boolean;

    protected: boolean;
    internal: boolean;
}

// collabvm-compatible machine
export abstract class BaseMachine extends ChannelController {

    private thinktimer: NodeJS.Timer;

    private turnQueueEmpty = true;
    private turnQueue: ClientContext[] = [];
    private turnEnd = Date.now();

    private voteActive = false;
    private voteEnd = Date.now();
    private voteAyes: ClientContext[] = [];
    private voteNays: ClientContext[] = [];

    private lastUpload: Map<string, number> = new Map();
    
    protected lastWidth: number = 800;
    protected lastHeight: number = 600;

    protected options: MachineConfig = {
        displayName: "default",
        motd: null,

        canTurn: false,
        canVote: false,
        canUpload: false,

        turnDuration: 30,
        voteDuration: 10,
        voteCooldown: 10,
        uploadCooldown: 10,

        announceJoinPart: true,
        announceNick: true,
        announceVote: true,
        announceVoters: true,
        announceUpload: true,

        protected: false,
        internal: false
    };

    protected cursorMetrics = {
        active: false,
        x: 0, y: 0,
        hx: 0, hy: 0,
        canvas: new Canvas(1, 1),
        packed: Buffer.alloc(1)
    };

    constructor(gw: EventGateway, chan: string) {
        super(gw, chan);

        this.on(MachineEvents.UserJoin, (ctx: ClientContext) => {
            if (this.options.announceJoinPart) {
                this.announce(`${ctx.nick} connected`);
            }
            ctx.announce(this.options.motd);
        });
        this.on(MachineEvents.UserPart, (ctx: ClientContext) => {
            if (this.options.announceJoinPart) {
                this.announce(`${ctx.nick} disconnected`);
            }
        });

        this.on(MachineEvents.UserNick, (ctx: ClientContext, oldnick: string) => {
            if (this.options.announceNick) {
                this.announce(`${oldnick} is now known as ${ctx.nick}`);
            }
        });

        this.on(MachineEvents.VoteBegin, () => {
            this.logger.print("a votereset is starting");
            if (this.options.announceVote) {
                this.announce("A votereset has been initiated.");
            }
        });
        this.on(MachineEvents.VoteSucceed, () => {
            this.logger.print("the votereset succeeded, resetting...");
            if (this.options.announceVote) {
                this.announce("Vote passed, resetting...");
            }
        });
        this.on(MachineEvents.VoteFail, () => {
            this.logger.print("the votereset failed");
            if (this.options.announceVote) {
                this.announce("The vote did not pass.");
            }
        });

        this.on(MachineEvents.VoteCount, (ctx: ClientContext, aye: boolean) => {
            this.logger.print(`${ctx.nick} (${ctx.ip}) voted ${aye ? "yes" : "no"}`);
            if (this.options.announceVoters) {
                this.announce(`${ctx.nick} voted ${aye ? "for" : "against"} the reset`);
            }
        });

        this.on(MachineEvents.FileUpload, (ctx: ClientContext, filename: string) => {
            this.logger.print(`${ctx.nick} (${ctx.ip}) uploaded ${filename}`);
            if (this.options.announceUpload) {
                this.announce(`${ctx.nick} uploaded ${he.encode(filename)}`);
            }
        });

        var lastuser: ClientContext = null;
        this.on(MachineEvents.QueueUpdate, (queue: ClientContext[]) => {
            if (queue.length === 0) {
                lastuser = null;
                this.logger.print("the turn queue is now empty");
            }
            else {
                if (lastuser !== queue[0]) {
                    lastuser = queue[0];
                    this.logger.print(`${lastuser.nick} (${lastuser.ip}) now has control of the vm`);
                }
            }
        });
    }

    get displayName(): string {
        return this.options.displayName;
    }

    override canUse(ctx: ClientContext) {
        const pblocked = this.options.protected && !hasCap(ctx.authcaps, AuthCap.SeeProtected);
        const iblocked = this.options.internal && !hasCap(ctx.authcaps, AuthCap.SeeInternal);
        return !(pblocked || iblocked);
    }
    canTakeTurn(ctx: ClientContext) {
        return this.canUse(ctx) && (hasCap(ctx.authcaps, AuthCap.TurnOverride) || this.options.canTurn);
    }
    canPlaceVote(ctx: ClientContext) {
        // it doesnt make much sense to have a "vote override" permission
        return this.canUse(ctx) && this.options.canVote;
    }
    canUploadFile(ctx: ClientContext) {
        // TODO: factor in whether the backend actually supports uploads
        return this.canUse(ctx) && (hasCap(ctx.authcaps, AuthCap.UploadOverride) || this.options.canUpload);
    }

    // periodic routine
    private _think() {
        const n = Date.now();

        // advance turn queue if needed
        if (!this.turnQueueEmpty && n > this.turnEnd) {
            this.rotate();
        }

        // finalize votes if needed
        if (this.voteActive && n > this.voteEnd) {
            this.endVote();
        }

        // set up think timer if it isnt already set up
        if (this.thinktimer == null) {
            this.thinktimer = setInterval(() => this._think(), 1000 / THINK_FPS);
        }

        // impl think
        this.think();
    }

    protected announce(html: string) {
        this.broadcast("chat", "", html);
    }

    private resetClock() {
        this.turnQueueEmpty = false;
        this.turnEnd = Date.now() + this.options.turnDuration * 1000;
    }

    // insert a client into the queue
    private enqueue(ctx: ClientContext) {
        // sanity check: dont allow stacking turns
        if (this.turnQueue.indexOf(ctx) !== -1) {
            return;
        }
        if (this.turnQueue.length === 0) {
            this.resetClock();
        }
        this.turnQueue.push(ctx);
        this._think();
        this.turnUpdate();
    }

    // advance the turn queue
    private rotate() {
        this.resetClock();
        this.turnQueue.shift();
        this.turnUpdate();
        if (this.turnQueue.length === 0) {
            this.turnQueueEmpty = true;
        }
    }

    // broadcast turn information
    private turnUpdate() {
        this.broadcastSpecial(ctx => {
            const n = Date.now();
            const r = Math.max(0, this.turnEnd - n);
            const i = this.turnQueue.indexOf(ctx);
            const t = this.options.turnDuration * 1000;
            return [
                "turn",
                r,
                this.turnQueue.length,
                ...this.turnQueue.map(x => x.nick),
                ...(i > 0 ? [(i - 1) * t + r] : [])
            ];
        });
        this.emit(MachineEvents.QueueUpdate, [...this.turnQueue]);
    }

    private hasTurn(ctx: ClientContext) {
        return ctx === this.turnQueue[0];
    }

    // check if a user has voted
    private hasVoted(ctx: ClientContext) {
        return this.voteAyes.indexOf(ctx) >= 0 || this.voteNays.indexOf(ctx) >= 0;
    }

    // clear a user's vote
    private clearVote(ctx: ClientContext): boolean {
        var hadone = false;
        const y = this.voteAyes.indexOf(ctx);
        if (y !== -1) {
            this.voteAyes.splice(y, 1);
            hadone = true;
        }
        const n = this.voteNays.indexOf(ctx);
        if (n !== -1) {
            this.voteNays.splice(n, 1);
            hadone = true;
        }
        return hadone;
    }

    // records a user's vote as yes
    private voteYes(ctx: ClientContext) {
        if (!this.voteActive) {
            return;
        }
        this.clearVote(ctx);
        this.voteAyes.push(ctx);
        this.voteUpdate();
        this.emit(MachineEvents.VoteCount, ctx, true);
    }

    // records a user's vote as no
    private voteNo(ctx: ClientContext) {
        if (!this.voteActive) {
            return;
        }
        this.clearVote(ctx);
        this.voteNays.push(ctx);
        this.voteUpdate();
        this.emit(MachineEvents.VoteCount, ctx, false);
    }

    private voteUpdate() {
        this.broadcast("vote", VOTE_STATUS,
            Math.max(0, this.voteEnd - Date.now()),
            this.voteAyes.length,
            this.voteNays.length
        );
    }

    // attempt to start a reset vote
    private startVote(ctx: ClientContext): void {
        // if vote is already active just return true
        if (!this.voteActive) {
            // cooldown check
            const n = Date.now();
            const m = this.voteEnd + this.options.voteCooldown * 1000;
            if (n > m) {
                this.voteAyes = [];
                this.voteNays = [];
                this.voteEnd = n + this.options.voteDuration * 1000;
                this.voteActive = true;
                this.emit(MachineEvents.VoteBegin);
            }
            else {
                ctx.send("vote", VOTE_TOOEARLY, Math.ceil((m - n) / 1000));
                return;
            }
        }

        // initiator votes yes
        this.voteYes(ctx);

        this._think();
    }

    private endVote(ignore = false) {
        if (!this.voteActive) {
            return;
        }
        this.voteActive = false;
        this.broadcast("vote", VOTE_END);
        if (ignore) {
            return;
        }
        if (this.voteAyes.length > this.voteNays.length) {
            this.emit(MachineEvents.VoteSucceed);
            this.doReset();
        }
        else {
            this.emit(MachineEvents.VoteFail);
        }
    }

    // resize the framebuffer
    protected resize(width: number, height: number) {
        this.lastWidth = width;
        this.lastHeight = height;
        this.broadcast("size", LAYER_FB, width, height);
    }

    // compress image data
    protected compress(width: number, height: number, data: WithImplicitCoercion<ArrayBuffer>, quality = 65): Buffer {
        return jpg.compressSync(Buffer.from(data), {
            format: jpg.FORMAT_RGBA,
            width: width,
            height: height,
            subsampling: jpg.SAMP_420,
            quality
        });
    }

    // draw a rect update
    protected rect(x: number, y: number, data: Buffer) {
        this.broadcast("png", 14, LAYER_FB, x, y, data);
    }

    protected setCursor(hx: number, hy: number,
        width: number, height: number, pixbuff: Uint8ClampedArray) {

        if (pixbuff.length < 1 || width < 1 || height < 1) {
            // ignore cursor blanking
            return;
        }
        else {
            this.cursorMetrics.active = true;
            this.cursorMetrics.hx = hx;
            this.cursorMetrics.hy = hy;
            this.cursorMetrics.canvas.width = width;
            this.cursorMetrics.canvas.height = height;
            const d = this.cursorMetrics.canvas.getContext("2d");
            const imgdata = new ImageData(pixbuff, width, height);
            d.putImageData(imgdata, 0, 0);
            this.cursorMetrics.packed = this.cursorMetrics.canvas.toBuffer("image/png");
        }
        this.broadcast("size", LAYER_PSEUDOCURSOR, width, height);
        this.broadcast("png", 12, LAYER_PSEUDOCURSOR, 0, 0, this.cursorMetrics.packed);
        this.broadcast("move", LAYER_PSEUDOCURSOR, 0, this.cursorMetrics.x - this.cursorMetrics.hx, this.cursorMetrics.y - this.cursorMetrics.hy, 0);
    }

    protected moveCursor(x: number, y: number) {
        this.broadcast("move", LAYER_PSEUDOCURSOR, 0, x - this.cursorMetrics.hx, y - this.cursorMetrics.hy, 0);
    }

    // sync to client canvas
    protected sync() {
        this.broadcast("sync", 0);
    }

    // load machine config
    loadConfig(data: MachineConfig) {
        this.options = data;
        this.broadcastSpecial(ctx => [
            "action",
            this.canTakeTurn(ctx),
            this.canPlaceVote(ctx),
            this.canUploadFile(ctx)
        ]);
    }

    // handle room join
    notifyJoin(ctx: ClientContext): void {
        // room info
        ctx.send(
            "connect",
            true,                       // state
            this.canTakeTurn(ctx),      // can take turns?
            this.canPlaceVote(ctx),     // can vote?
            this.canUploadFile(ctx),    // can upload?
            this.gw.maxPost,            // max upload size
            MAX_UPLOAD_NAME             // max filename length
        );

        // send vote state
        if (this.voteActive) {
            ctx.send("vote", VOTE_STATUS,
                Math.max(0, this.voteEnd - Date.now()),
                this.voteAyes.length,
                this.voteNays.length
            );
        }

        // send initial screen data
        try {
            ctx.send("size", LAYER_FB, this.lastWidth, this.lastHeight);
            ctx.send("png", 14, LAYER_FB, 0, 0, this.getFrameBuffer());
            ctx.send("sync", 0);
        }
        catch (e) {
            // adapter isnt ready
        }

        //ctx.send("shade", LAYER_PSEUDOCURSOR, 0);
        if (this.cursorMetrics.active) {
            const cw = this.cursorMetrics.canvas.width;
            const ch = this.cursorMetrics.canvas.height;
            ctx.send("size", LAYER_PSEUDOCURSOR, cw, ch);
            ctx.send("png", 12, LAYER_PSEUDOCURSOR, 0, 0, this.cursorMetrics.packed);
            //this.broadcast("cursor", this.cursorMetrics.hx, this.cursorMetrics.hy, LAYER_PSEUDOCURSOR, 0, 0, cw, ch);
            ctx.send("move", LAYER_PSEUDOCURSOR, 0, this.cursorMetrics.x, this.cursorMetrics.y, 0);
        }

        // ugly way of giving some time for automated handshaking
        if (this.gw.authMandate && !hasCap(ctx.authcaps, AuthCap.Registered)) {
            setTimeout(() => {
                if (!hasCap(ctx.authcaps, AuthCap.Registered)) {
                    ctx.announce("Authentication is mandatory on this instance. Please log in.");    
                }
            }, 250);
        }

        this.emit(MachineEvents.UserJoin, ctx);
    }

    // handle room part
    notifyPart(ctx: ClientContext): void {
        // remove from turn queue
        const i = this.turnQueue.indexOf(ctx);
        if (i !== -1) {
            this.turnQueue.splice(i, 1);
            this.turnUpdate();
        }
        
        // remove any votes
        if (this.clearVote(ctx)) {
            this.voteUpdate();
        }

        this.emit(MachineEvents.UserPart, ctx);
    }

    notifyNick(ctx: ClientContext, oldnick: string): void {
        this.emit(MachineEvents.UserNick, ctx, oldnick);
    }

    notifyIdentify(ctx: ClientContext): void {
        ctx.send("action",
            this.canTakeTurn(ctx),
            this.canPlaceVote(ctx),
            this.canUploadFile(ctx));
    }

    // interpret guac/collabvm-specific opcode
    interpret(ctx: ClientContext, opcode: string, ...args: wireprim[]): void {
        switch (opcode) {
            case "turn":
                if (this.canTakeTurn(ctx)) {
                    const i = this.turnQueue.indexOf(ctx);
                    if (i === 0) {
                        this.rotate();
                    }
                    else if (i > 0) {
                        // XXX: would allow relinquishing place in queue, but it's too easy to do by accident
                        //this.turnqueue.splice(i, 1);
                        //this.turnUpdate();
                    }
                    else {
                        this.enqueue(ctx);
                    }
                }
                break;
            case "vote":
                if (this.canPlaceVote(ctx)) {
                    const b = ensureBoolean(args[0]);
                    if (b) {
                        this.startVote(ctx);
                    }
                    else {
                        // only bother to record nay vote if there's an active vote
                        if (this.voteActive) {
                            this.voteNo(ctx);
                        }
                    }
                }
                break;
            case "file":
                if (this.canUploadFile(ctx)) {
                    const name = ensureString(args[1]);
                    const size = ensureNumber(args[2]);
                    const run = ensureBoolean(args[3]);

                    // if within cooldown period, ignore it
                    if (ctx.ip in this.lastUpload &&
                        Date.now() <= this.lastUpload[ctx.ip] + this.options.uploadCooldown * 1000) {
                        return;
                    }

                    // if file is too big, ignore it
                    if (size > this.gw.maxPost) {
                        return;
                    }

                    // setup post callback
                    const token = v4();
                    this.gw.uploads.registerPostCallback(token, data => {
                        const n = Date.now();
                        this.lastUpload[ctx.ip] = n;
                        this.pushFile(name, data, run);
                        ctx.send("file", FILE_SUCCESS, this.options.uploadCooldown * 1000);
                        this.emit(MachineEvents.FileUpload, ctx, name);
                    });

                    // send post token to client
                    ctx.send("file", FILE_TOKEN, token);
                }
                break;
            case "mouse":
                if (this.hasTurn(ctx)) {
                    const x = ensureNumber(args[0]);
                    const y = ensureNumber(args[1]);
                    // sanity check: does the position even make sense?
                    //               guac likes sending insane values sometimes when moving away from screen
                    if (x < 0 || y < 0 || x >= this.lastWidth || y >= this.lastHeight) {
                        break;
                    }
                    const d = ensureNumber(args[2]);
                    this.cursorMetrics.x = x;
                    this.cursorMetrics.y = y;
                    this.moveCursor(x, y);
                    this.setMouse(x, y, d);
                }
                break;
            case "key":
                if (this.hasTurn(ctx)) {
                    const k = ensureNumber(args[0]);
                    const o = ensureBoolean(args[1]);
                    this.setKey(k, o);
                }
                break;
        }
    }

    reset() {
        this.doReset();
    }

    destroy() {
        clearInterval(this.thinktimer);
        this.destroyImpl();
    }

    abstract getFrameBuffer(): Buffer;
    protected abstract setMouse(x: number, y: number, buttons: number): void;
    protected abstract setKey(keycode: number, on: boolean): void;
    protected doReset(): void { }
    protected pushFile(name: string, data: Buffer, autorun: boolean): void { }
    protected think(): void { }
    protected abstract destroyImpl(): void | Promise<void>;

}