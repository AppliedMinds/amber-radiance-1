import { createServer } from 'node:net'

// Mock client based on bench-testing
export class MockCamera {
    constructor({ port } = {}) {
        this.imageInverted = false
        this.agc = -1
        this.nuc = 1
        this.lut = 1
        this.itt = 1
        this.contrast = 100
        this.brightness = 100
        this.frozen = false
        this.cooler = true
        this.running1PointCalibration = false
        this.running2PointCalibration = false
        this.broken = false
        this.osd = true
        this.colorBar = false
        this.port = port
    }
    attachClient(client) {
        this.client = client
        this.client.on('data', this.receive.bind(this))
        // Nothing is sent on startup
    }
    close() {
        return new Promise(res => {
            this.server.close(res)
        })
    }
    listen(port = 53000) {
        // Serial mode
        if (port instanceof Object) {
            this.server = this.client = port
            this.server.open()
            this.server.on('dataIn', this.receive.bind(this))
            return
        }
        this.server = createServer(this.attachClient.bind(this))
        return new Promise(res => {
            this.server.listen(port, res)
        })
    }
    receive(data) {
        // Ignore too small data lengths
        if (data.length < 13) return
        const msg = data
        const versionMajor = msg[0]
        const versionMinor = msg[1]
        const processID = msg[2]
        const functionCode = msg[3]
        const subFunctionCode = msg[4]
        const messageID = msg[5]
        const iStatus = msg[6]
        const cStatus = msg[7]
        const dataBlockSize = msg.readUInt16LE(8)
        const dataBlock = msg.subarray(10, 10 + dataBlockSize)
        const checkSum = msg[10 + dataBlockSize]
        const footer1 = msg[10 + dataBlockSize + 1]
        const footer2 = msg[10 + dataBlockSize + 2]
        const footer3 = msg[10 + dataBlockSize + 3]

        // Ensure software version and rest of header matches expectation
        if (versionMajor !== 3 ||
            versionMinor !== 0 ||
            processID !== 1 ||
            iStatus !== 0xff ||
            cStatus !== 0xff) return

        // Ensure checksum matches
        let expected = 0
        for (let i = 0; i < 10 + dataBlockSize; i++) {
            expected += msg[i]
        }
        if (expected % 256 !== checkSum) return

        // Ensure footer matches
        if (footer1 !== 2 ||
            footer2 !== 0 ||
            footer3 !== 0) return

        // Check command to execute
        let response
        // AGC disable
        if (functionCode === 1 && subFunctionCode === 0) {
            this.agc = false
        // AGC enable
        } else if (functionCode === 1 && subFunctionCode === 1) {
            this.agc = true
        // Get AGC
        } else if (functionCode === 1 && subFunctionCode === 2) {
            response = Buffer.from([this.agc === -1 ? 0 : 1, 0x00])
        // Set AGC
        } else if (functionCode === 1 && subFunctionCode === 3) {
            this.agc = dataBlock.readUInt16LE()
        // Cooler off/on
        } else if (functionCode === 3 && subFunctionCode === 2) {
            this.cooler = false
        } else if (functionCode === 3 && subFunctionCode === 3) {
            this.cooler = true
        // Status
        } else if (functionCode === 3 && subFunctionCode === 5) {
            response = Buffer.from([0xe6, 0x56, 0x63, 0x57, 0x22, 0x38, 0x57, 0x55])
        // Freeze frame
        } else if (functionCode === 4 && subFunctionCode === 1) {
            this.frozen = !this.frozen
        // Change brightness
        } else if (functionCode === 4 && subFunctionCode === 4) {
            this.brightness++
        } else if (functionCode === 4 && subFunctionCode === 5) {
            this.brightness--
        // Change contrast
        } else if (functionCode === 4 && subFunctionCode === 6) {
            this.contrast++
        // Invert image
        } else if (functionCode === 4 && subFunctionCode === 7) {
            this.contrast--
        // Invert image
        } else if (functionCode === 5 && subFunctionCode === 0) {
            this.imageInverted = !this.imageInverted
        // Set LUT mode
        } else if (functionCode === 5 && subFunctionCode === 1) {
            this.lut = dataBlock.readUInt16LE()
        // Get LUT mode
        } else if (functionCode === 5 && subFunctionCode === 2) {
            response = Buffer.from([this.lut, 0x00])
        // Set ITT mode
        } else if (functionCode === 5 && subFunctionCode === 4) {
            this.itt = dataBlock.readUInt16LE()
        // Get ITT mode
        } else if (functionCode === 5 && subFunctionCode === 5) {
            response = Buffer.from([this.itt, 0x00])
        // Color bar overlay off/on
        } else if (functionCode === 5 && subFunctionCode === 0xc) {
            this.colorBar = false
        } else if (functionCode === 5 && subFunctionCode === 0xd) {
            this.colorBar = true
        // OSD off/on
        } else if (functionCode === 6 && subFunctionCode === 0) {
            this.osd = false
        } else if (functionCode === 6 && subFunctionCode === 1) {
            this.osd = true
        // Run 1 point calibration
        } else if (functionCode === 7 && subFunctionCode === 1) {
            // Two parameters are passed, one is the NUC, second one is unknown
            const nuc = dataBlock.readUInt16LE()
            const unknown = dataBlock.readUInt16LE(2)
            this.running1PointCalibration = true
        // Run 2 point calibration
        } else if (functionCode === 7 && subFunctionCode === 2) {
            // Two parameters are passed, one is the NUC, second one is unknown
            const nuc = dataBlock.readUInt16LE()
            const unknown = dataBlock.readUInt16LE(2)
            this.running2PointCalibration = true
        // Set NUC mode
        } else if (functionCode === 7 && subFunctionCode === 5) {
            this.nuc = dataBlock.readUInt16LE()
        // Get NUC mode
        } else if (functionCode === 7 && subFunctionCode === 6) {
            response = Buffer.from([this.nuc, 0x00])
        } else {
            return
        }
        return this.respond({ functionCode, subFunctionCode, messageID, response })
    }
    respond({ functionCode, subFunctionCode, messageID, response = Buffer.alloc(0) }) {
        if (this.broken) return

        // The device writes 1-3 bytes per time
        this.client.write(Buffer.from([0x03]))
        this.client.write(Buffer.from([0x00, 0x01]))
        this.client.write(Buffer.from([functionCode, subFunctionCode]))
        this.client.write(Buffer.from([messageID, 0x00, 0x00]))

        const dataBytes = response.length
        this.client.write(Buffer.from([dataBytes, 0x00]))

        if (response) this.client.write(response)

        const checkSum = (3 + 1 + functionCode + subFunctionCode + messageID + dataBytes + response.values().reduce((a, c) => a + c, 0)) % 256
        this.client.write(Buffer.from([checkSum, 0x00]))
        this.client.write(Buffer.from([0x00, 0x00]))
    }
}
