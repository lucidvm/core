import { OpusDecoderWebWorker } from "opus-decoder";

var inited = false;

export function initHurl(uri, chan) {

    console.debug("hurl");

    if (inited) return;

    var audioctx;
    var scriptNode;
    var connected = false;

    const audioQueue = {
        buffer: [new Float32Array(0), new Float32Array(0)],

        write(chan, newAudio) {
            const c = this.buffer[chan].length;
            var newBuffer = new Float32Array(c + newAudio.length);
            newBuffer.set(this.buffer[chan], 0);
            newBuffer.set(newAudio, c);
            this.buffer[chan] = newBuffer;
        },

        read(chan, nSamples) {
            var samplesToPlay = this.buffer[chan].subarray(0, nSamples);
            this.buffer[chan] = this.buffer[chan].subarray(nSamples, this.buffer[chan].length);
            return samplesToPlay;
        },

        length() {
            return this.buffer[0].length;
        }
    };

    function setRate(rate) {
        if (audioctx != null) { audioctx.close(); }
        audioctx = new AudioContext({ sampleRate: rate });
        scriptNode = audioctx.createScriptProcessor(null, 2, 2);
        const silence = new Float32Array(scriptNode.bufferSize);
        scriptNode.onaudioprocess = e =>  {
            if (audioQueue.length()) {
                e.outputBuffer.getChannelData(0).set(audioQueue.read(0, scriptNode.bufferSize));
                e.outputBuffer.getChannelData(1).set(audioQueue.read(1, scriptNode.bufferSize));
            } else {
                e.outputBuffer.getChannelData(0).set(silence);
                e.outputBuffer.getChannelData(1).set(silence);
                disconnect();
            }
        };
        scriptNode.connect(audioctx.destination);
    }

    var opus = new OpusDecoderWebWorker({ channels: 2, forceStereo: true });

    var ws = new WebSocket(uri);
    ws.binaryType = "arraybuffer";
    ws.addEventListener("message", function (event) {
        const data = event.data;
        if (typeof data === "string") {
            const ev = JSON.parse(data);
            switch (ev.event) {
                case "mode":
                    setRate(ev.data.rate);
                    break;
            }
        }
        else {
            opus.ready.then(() => {
                opus.decodeFrame(new Uint8Array(data)).then(data => {
                    audioQueue.write(0, data.channelData[0]);
                    audioQueue.write(1, data.channelData[1]);
                    if (audioQueue.length() > data.channelData[0].length * 6) {
                        reconnect();
                    }
                });
            });
        }
    });
    ws.addEventListener("open", () => {
        setTimeout(() => {
            ws.send(JSON.stringify({ event: "tune", data: { channel: chan } }));
        }, 100);
    });

    inited = true;

}