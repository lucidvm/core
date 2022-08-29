import fs from "fs";
import process from "process";
import path from "path";
import { EventEmitter } from "events";
import { spawn, ChildProcess } from "child_process";
import { Socket } from "net";

import split from "split";

const QMP_BASE = 5700;
const GIA_BASE = 5800;
const VNC_BASE = 5900;

export interface QEMUOptions {
    root: string;
    snapshot?: string;

    arch?: string;
    ram?: number;
    vga?: string;
    nic?: string;
    tap: string | string[];

    vncbind?: string;
    vncpw: string;

    cmdline?: string;
}

export class QEMUMonitor extends EventEmitter {

    private readonly qemubin: string;
    private readonly qemuarg: string[];

    readonly qmpport: number;
    readonly vncport: number;
    private snapshotname: string;

    private process: ChildProcess;
    private stopping = true;

    private qmp: Socket;
    private callbacks: ((x: any, e: any) => void)[] = [];

    constructor(index: number, options: QEMUOptions) {
        super();

        if (index == null) {
            throw new Error("index must be specified");
        }
        if (options.root == null || options.tap == null || options.vncpw == null) {
            throw new Error("root, tap, vncpw must be specified");
        }

        // get the binary name
        const arch = options.arch ?? "x86_64";
        const bin = "qemu-system-" + arch;

        // calculate port numbers
        const qmpport = QMP_BASE + index;
        const vncport = VNC_BASE + index;

        const hdapath = path.join(options.root, "hda.qcow2");
        const isopath = path.join(options.root, "install.iso");

        // construct cmdline
        const params: string[] = [
            // hardware config
            "-m", options.ram?.toString() ?? "512",
            "-drive", `id=hda,file=${hdapath}`,
            "-vga", options.vga ?? "qxl",
            "-boot", "cd",
            "-usb",
            "-device", "usb-tablet",
        
            // dont allow the machine to shut off
            "-no-shutdown",

            // vnc kvm socket
            //"-object", `secret,id=vncpw,data=${options.vncpw}`,
            //"-vnc", `${options.vncbind ?? "127.0.0.1"}:${index},password-secret=vncpw`,
            "-vnc", `${options.vncbind ?? "127.0.0.1"}:${index}`,
            // qmp control socket
            "-qmp", `tcp:127.0.0.1:${qmpport},server,nodelay`,
            // guest-side agent socket
            "-chardev", `socket,id=agent,host=127.0.0.1,port=${5800 + index},server,nodelay,nowait`,
            "-device", "virtio-serial", "-device", "virtserialport,chardev=agent"
        ];

        // add network devices
        if (typeof options.tap === "string") options.tap = [options.tap];
        for (var i = 0; i < options.tap.length; i++) {
            params.push(
                "-netdev", `tap,id=tap${i},ifname=${options.tap[i]},script=no,downscript=no`,
                "-device", `${options.nic ?? "virtio-net"},netdev=tap${i},mac=DE:AD:BE:EF:${i.toString(16).padStart(2, "0")}:${index.toString(16).padStart(2, "0")}`,
            );
        }

        // use kvm if applicable
        // XXX: we should detect arm! not a big deal for now, though
        if (process.platform === "linux" && process.arch === "x64" && (arch === "i386" || arch === "x86_64")) {
            params.unshift("-enable-kvm");
        }

        // if a snapshot was specified, pass it to qemu
        if (options.snapshot != null) {
            params.push("-loadvm");
            params.push(options.snapshot);
        }

        // add cd if it exists
        if (fs.existsSync(isopath)) {
            params.push("-cdrom");
            params.push(isopath);
        }

        // set some fields we use later
        this.qemubin = bin;
        this.qemuarg = params;
        this.qmpport = qmpport;
        this.vncport = vncport;
        this.snapshotname = options.snapshot;

        // create an event listener to kick the vm if it gets shut down
        this.on("qmp_shutdown", () => {
            this.hmp("system_reset");
            this.hmp("cont");
        });
    }

    private init() {
        if (this.qmp != null && !this.qmp.destroyed) {
            this.qmp.destroy();
        }

        console.debug(`starting qemu -> ${this.qemubin} ${this.qemuarg.join(" ")}`);

        this.process = spawn(this.qemubin, this.qemuarg);
        this.process.stderr.pipe(process.stderr);
        this.process.on("exit", () => {
            if (!this.stopping) {
                console.warn("qemu exited, restarting!");
                this.init();
            }
        });
        console.log("qemu started, waiting a sec before connecting to qmp");

        setTimeout(() => {
            this.qmp = new Socket();
            this.qmp.once("data", (_data) => {
                this.qmp.pipe(split()).on("data", line => {
                    //console.debug("qmp:", line);
                    if (!line) return this.qmp.end();
                    const json = JSON.parse(line);
                    if (json.return || json.error) {
                        const cb = this.callbacks.shift();
                        if (cb != null) cb(json.return, json.error);
                    }
                    else if (json.event) {
                        this.emit("qmp_" + json.event.toLowerCase(), json.event);
                    }
                });
                this.do("qmp_capabilities").then(() => this.emit("connected"));
            });
            this.qmp.once("error", () => {
                console.warn("qmp socket error!");
            });
            this.qmp.once("close", () => {
                console.warn("lost connection to qmp!");
            });
            this.qmp.connect({
                host: "127.0.0.1",
                port: this.qmpport
            });
        }, 1000);
    }

    start() {
        if (this.stopping) {
            this.stopping = false;
            this.init();
        }
    }

    stop() {
        if (!this.stopping) {
            this.stopping = true;
            if (this.qmp != null) this.qmp.destroy();
            if (this.process != null) this.process.kill("SIGTERM");
        }
    }

    do(execute: string, args: { [key: string]: any } = {}): Promise<any> {
        const prom = new Promise((resolve, reject) => this.callbacks.push((x, e) => {
            if (e != null) reject(new Error("QMP: " + e.desc));
            resolve(x);
        }));
        this.qmp.write(JSON.stringify({ execute, arguments: args }));
        return prom;
    }

    hmp(command: string) {
        return this.do("human-monitor-command", { "command-line": command });
    }

    hasSnapshot() {
        return this.snapshotname != null;
    }

    snapshot(name: string) {
        this.snapshotname = name;
        this.hmp(`savevm ${name}`);
        this.emit("snapshot");
    }

    reset() {
        if (this.snapshotname != null) {
            this.hmp(`loadvm ${this.snapshotname}`);
        }
        else {
            console.warn("attempted to reset, but no snapshot configured!");
        }
    }

}