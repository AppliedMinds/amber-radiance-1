import { EventEmitter, once } from 'node:events'
import { Device as TCPDevice } from '@appliedminds/tcp'
import { Device as SerialDevice } from '@appliedminds/serial'

function invertMap(obj) {
    const inverted = {}
    for (const key in obj) {
        inverted[obj[key]] = key
    }
    return inverted
}

// Standard packets are 14 bytes. Each byte as follows:
// 0: Major Revision (always 0x03)
// 1: Minor Revision (always 0x00)
// 2: Process ID (always 0x01)
// 3: Function Number
// 4: Subfunction Number
// 5: Packet number
// 6: IStatus (?) (always 0xff)
// 7: CStatus (?) (always 0xff)
// 8: Data count 1
// 9: Data count 2
// 10: Checksum (first 10 bytes summed, mod 256)
// 11: Unknown (always 2)
// 12: Unknown (always 0)
// 13: Unknown (always 0)
const STD_HEADER = Buffer.alloc(8)
STD_HEADER[0] = 3 // Major revision
STD_HEADER[1] = 0 // Minor revision
STD_HEADER[2] = 1 // Process ID
STD_HEADER[6] = 0xff // IStatus
STD_HEADER[7] = 0xff // CStatus

const STD_FOOTER = Buffer.alloc(4)
STD_FOOTER[1] = 2 // Unknown

// Function/Subfunction Lookup Table
const FUNCTIONS = {
    AGC_OFF: [1, 0],
    AGC_ON: [1, 1],
    AGC_GET: [1, 2],
    AGC_SET: [1, 3],
    COOLER_OFF: [3, 2],
    COOLER_ON: [3, 3],
    STATUS_GET: [3, 5],
    FREEZE_FRAME: [4, 1],
    BRIGHTNESS_UP: [4, 4],
    BRIGHTNESS_DOWN: [4, 5],
    CONTRAST_UP: [4, 6],
    CONTRAST_DOWN: [4, 7],
    INVERT_IMAGE: [5, 0],
    LUT_SET: [5, 1],
    LUT_GET: [5, 2],
    ITT_SET: [5, 4],
    ITT_GET: [5, 5],
    COLOR_BAR_OFF: [5, 0x0c],
    COLOR_BAR_ON: [5, 0x0d],
    OSD_OFF: [6, 0],
    OSD_ON: [6, 1],
    CALIBRATE_1_POINT: [7, 1],
    CALIBRATE_2_POINT: [7, 2],
    NUC_SET: [7, 5],
    NUC_GET: [7, 6],
}

// Automatic Gain Control Modes
const AGC_MODES = {
    off: -1,
    full: 0,
    midsize: 1,
    center: 2,
    horizon: 3,
}

// Intensity Transform Table Modes
const ITT_MODES = {
    linear: 1,
    inverse: 2,
    's-curve': 3,
    'two-cycle': 4
}
const ITT_MAP = invertMap(ITT_MODES)

// Non-Uniformity Correction Modes
const NUC_MODES = {
    cold: 1,
    mid: 2,
    warm: 3,
    hot: 4
}
const NUC_MAP = invertMap(NUC_MODES)

// Look-Up Table Modes
const LUT_MODES = {
    'black-and-white': 1,
    color: 2,
    sepia: 3
}
const LUT_MAP = invertMap(LUT_MODES)

const RESPONSE_TIMEOUT = 1000 // ms

function createPacket(messageNumber, command, subCommand = 0, ...data) {
    // Create a standard header
    const header = Buffer.from(STD_HEADER)
    // Set command bytes
    header[3] = command
    header[4] = subCommand
    // Set message number
    header[5] = messageNumber

    // Set data (if given)
    const dataSize = 2 + data.length * 2
    const dataBlock = Buffer.alloc(dataSize)
    if (data.length) {
        dataBlock.writeUInt16LE(data.length * 2)
        for (let i = 0; i < data.length; i++) {
            dataBlock.writeUInt16LE(data[i], 2 + i * 2)
        }
    }

    // Create standard footer
    const footer = Buffer.from(STD_FOOTER)

    // Calculate checksum
    const msg = Buffer.concat([header, dataBlock])
    for (let i = 0; i < msg.length; i++) {
        footer[0] += msg[i]
    }

    return Buffer.concat([msg, footer])
}

function parsePacket(buff, dataSize) {
    // Check checksum
    let expected = 0
    for (let i = 0; i < 10 + dataSize; i++) {
        expected += buff[i]
    }

    if (buff[10 + dataSize] !== expected % 256) {
        throw new Error(`Incorrect checksum: Expected ${expected % 256}, got ${buff[10 + dataSize]}. Ignoring...`)
    }

    const messageID = buff[5]
    const response = dataSize ? buff.subarray(10, 10 + dataSize) : undefined
    return { messageID, response }
}

// Validate option against a list of options
function validate(option, options) {
    if (!Object.keys(options).includes(option)) throw new Error(`Option "${option}" is invalid. Available options are [${Object.keys(options).map(v => `"${v}"`).join(', ')}]`)
    return options[option]
}

const TRANSPORTS = {
    tcp: { className: TCPDevice, defaultArgs: { responseTimeout: 1 } },
    serial: { className: SerialDevice, defaultArgs: { baudRate: 38400, autoConnect: false, parser: null } }
}

// Serial or TCP Client for a Raytheon Amber Radiance 1 IR camera
export class Camera extends EventEmitter {
    constructor({ host, port, verbose = false, transport = 'tcp' }) {
        super()
        this.verbose = verbose
        const { className, defaultArgs } = TRANSPORTS[transport]
        this.controller = new className({ host, port, ...defaultArgs })
        this.controller.on('connect', () => {
            if (this.verbose) console.info('Connected to Camera')
        })
        this.controller.on('data', this.receive.bind(this))
        this.controller.on('error', console.error)
        this.controller.on('reconnect', console.warn)

        this.messageNumber = 1
        this.receiveBuffer = Buffer.alloc(0)
        this.responseTimeout = RESPONSE_TIMEOUT
    }
    close() {
        return this.controller.close()
    }
    connect() {
        // Connect to control port
        return this.controller.connect()
    }
    // Only returns true/false, not the actual mode that was set
    async getAGC() {
        const response = await this.send(...FUNCTIONS.AGC_GET)
        return response.readUInt16LE(0) ? true : false
    }
    async getITT() {
        const response = await this.send(...FUNCTIONS.ITT_GET)
        return ITT_MAP[response.readUInt16LE(0)]
    }
    async getLUT() {
        const response = await this.send(...FUNCTIONS.LUT_GET)
        return LUT_MAP[response.readUInt16LE(0)]
    }
    async getNUC() {
        const response = await this.send(...FUNCTIONS.NUC_GET)
        return NUC_MAP[response.readUInt16LE(0)]
    }
    async getStatus() {
        const response = await this.send(...FUNCTIONS.STATUS_GET)
        return {
            numCoolerCycles: response.readUInt16LE(0),
            numPowerCycles: response.readUInt16LE(2),
            coolerTime: response.readUInt32LE(4) // Seems to be a timestamp
        }
    }
    invertImage() {
        return this.send(...FUNCTIONS.INVERT_IMAGE)
    }
    receive(data) {
        // eslint-disable-next-line
        if (this.verbose) console.debug('<<< ', data)
        this.receiveBuffer = Buffer.concat([this.receiveBuffer, data])
        if (this.receiveBuffer.length >= 14) {
            // Get data size
            const dataSize = this.receiveBuffer.readUInt16LE(8)

            // Ensure packet is big enough
            const packetSize = 14 + dataSize
            if (this.receiveBuffer.length >= packetSize) {
                const packet = this.receiveBuffer.subarray(0, packetSize)
                this.receiveBuffer = this.receiveBuffer.subarray(packetSize)
                const { messageID, response } = parsePacket(packet, dataSize)
                this.emit(`confirm/${messageID}`, response)
            }
        }
    }
    async run1PointCalibration() {
        const nucMode = await this.getNUC()
        return this.send(...FUNCTIONS.CALIBRATE_1_POINT, nucMode, 0)
    }
    async run2PointCalibration() {
        const nucMode = await this.getNUC()
        return this.send(...FUNCTIONS.CALIBRATE_2_POINT, nucMode, 0)
    }
    // Delta can be 1 or -1
    setBrightness(delta) {
        return this.send(...delta > 0 ? FUNCTIONS.BRIGHTNESS_UP : FUNCTIONS.BRIGHTNESS_DOWN)
    }
    setCooler(enabled) {
        return this.send(...enabled ? FUNCTIONS.COOLER_ON : FUNCTIONS.COOLER_OFF)
    }
    // Delta can be 1 or -1
    setContrast(delta) {
        return this.send(...delta > 0 ? FUNCTIONS.CONTRAST_UP : FUNCTIONS.CONTRAST_DOWN)
    }
    // Set automatic gain control
    async setAGC(mode) {
        validate(mode, AGC_MODES)
        if (mode === 'off') {
            return this.send(...FUNCTIONS.AGC_OFF)
        }
        await this.send(...FUNCTIONS.AGC_ON)
        return this.send(...FUNCTIONS.AGC_SET, AGC_MODES[mode])
    }
    // Set Intensity Transform Table
    // mode can be linear, inverse, s-curve, or two-cycle
    setITT(mode) {
        validate(mode, ITT_MODES)
        return this.send(...FUNCTIONS.ITT_SET, ITT_MODES[mode])
    }
    // Set Look-Up Table
    // mode can be black-and-white, color or sepia
    setLUT(mode) {
        validate(mode, LUT_MODES)
        return this.send(...FUNCTIONS.LUT_SET, LUT_MODES[mode])
    }
    // Set Non-Uniformity Correction
    // mode can be cold, mid, warm or hot
    setNUC(mode) {
        validate(mode, NUC_MODES)
        return this.send(...FUNCTIONS.NUC_SET, NUC_MODES[mode])
    }
    async send(command, ...args) {
        const packet = createPacket(this.messageNumber, command, ...args)
        const confirmation = once(this, `confirm/${this.messageNumber++}`, { signal: AbortSignal.timeout(this.responseTimeout) })
        this.controller.send(packet)
        try {
            const confirmed = await confirmation
            return confirmed[0]
        } catch (e) {
            throw e.cause
        }
    }
    toggleColorBar(enabled) {
        return this.send(...enabled ? FUNCTIONS.COLOR_BAR_ON : FUNCTIONS.COLOR_BAR_OFF)
    }
    toggleFreezeFrame() {
        return this.send(...FUNCTIONS.FREEZE_FRAME)
    }
    // On-screen display on/off
    toggleOSD(enabled) {
        return this.send(...enabled ? FUNCTIONS.OSD_ON : FUNCTIONS.OSD_OFF)
    }
}
