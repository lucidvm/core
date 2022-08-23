class SocketBuffer {

    constructor() {

        this.flush();

    }

    flush(keep = true) {
        if (keep && this.buffer?.length) {
            this.buffer = this.buffer.slice(this.offset);
            this.offset = 0;
        } else {
            this.buffer = Buffer.from([]);
            this.offset = 0;
        }
    }

    toString() {
        return this.buffer.toString();
    }

    includes(check) {
        return this.buffer.includes(check);
    }

    pushData(data) {
        this.buffer = Buffer.concat([this.buffer, data]);
    }

    readInt32BE() {
        const data = this.buffer.readInt32BE(this.offset);
        this.offset += 4;
        return data;
    }

    readInt32LE() {
        const data = this.buffer.readInt32LE(this.offset);
        this.offset += 4;
        return data;
    }

    readUInt32BE() {
        const data = this.buffer.readUInt32BE(this.offset);
        this.offset += 4;
        return data;
    }

    readUInt32LE() {
        const data = this.buffer.readUInt32LE(this.offset);
        this.offset += 4;
        return data;
    }

    readUInt16BE() {
        const data = this.buffer.readUInt16BE(this.offset);
        this.offset += 2;
        return data;
    }

    readUInt16LE() {
        const data = this.buffer.readUInt16LE(this.offset);
        this.offset += 2;
        return data;
    }

    readUInt8() {
        const data = this.buffer.readUInt8(this.offset);
        this.offset += 1;
        return data;
    }

    readInt8() {
        const data = this.buffer.readInt8(this.offset);
        this.offset += 1;
        return data;
    }

    readNBytes(bytes, offset = this.offset) {
        return this.buffer.slice(offset, offset + bytes);
    }

    readNBytesOffset(bytes) {
        const data = this.buffer.slice(this.offset, this.offset + bytes);
        this.offset += bytes;
        return data;
    }

    setOffset(n) {
        this.offset = n;
    }

    bytesLeft() {
        return this.buffer.length - this.offset;
    }

    waitBytes(bytes, name) {
        if (this.bytesLeft() >= bytes) {
            return;
        }
        let counter = 0;
        return new Promise(async (resolve, reject) => {
            while (this.bytesLeft() < bytes) {
                counter++;
                // console.log('Esperando. BytesLeft: ' + this.bytesLeft() + '  Desejados: ' + bytes);
                await this.sleep(4);
                if (counter === 50) {
                    //console.log('Stucked on ' + name + '  -  Buffer Size: ' + this.buffer.length + '   BytesLeft: ' + this.bytesLeft() + '   BytesNeeded: ' + bytes);
                }
            }
            resolve();
        });
    }

    fill(data) {
        this.buffer.fill(data, this.offset, this.offset + data.length);
        this.offset += data.length;
    }

    fillMultiple(data, repeats) {
        this.buffer.fill(data, this.offset, this.offset + (data.length * repeats));
        this.offset += (data.length * repeats);
    }

    sleep(n) {
        return new Promise((resolve, reject) => {
            setTimeout(resolve, n);
        })
    }

}

module.exports = SocketBuffer;
