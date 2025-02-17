import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import { EventEmitter } from 'node:events'

class MockPort extends EventEmitter {
    open() {}
    close(cb) {
        cb()
    }
    write(data) {
        this.emit('dataOut', data)
    }
}
const mockPort = new MockPort('/dev/ttyS0fake', { baudRate: 38400 })

class MockSerialDevice extends EventEmitter {
    connect() {
        mockPort.on('dataOut', this.emit.bind(this, 'data'))
    }
    close() {}
    send(data) {
        mockPort.emit('dataIn', data)
    }
}

mock.module('@appliedminds/serial', {
    namedExports: { Device: MockSerialDevice }
})

const { MockCamera } = await import('./device.mocks.js')
const { Camera } = await import('../index.js')

let mockHardware, device

describe('Amber Radiance 1 (TCP Transport)', () => {
    beforeEach(async() => {
        // Start fake server
        mockHardware = new MockCamera()
        await mockHardware.listen()
        // Start our client
        device = new Camera({ host: '127.0.0.1', port: 53000 })
    })

    afterEach(async() => {
        await device.close()
        await mockHardware.close()
    })

    describe('Basic Operation', () => {
        it('changes brightness', async() => {
            await device.connect()
            await device.setBrightness(-1)
            assert.equal(mockHardware.brightness, 99)
            await device.setBrightness(1)
            assert.equal(mockHardware.brightness, 100)
        })
        it('changes contrast', async() => {
            await device.connect()
            await device.setContrast(1)
            assert.equal(mockHardware.contrast, 101)
            await device.setContrast(-1)
            assert.equal(mockHardware.contrast, 100)
        })
        it('inverts the image', async() => {
            await device.connect()
            await device.invertImage()
            assert.equal(mockHardware.imageInverted, true)
        })
        it('runs 1 point calibration', async() => {
            await device.connect()
            await device.run1PointCalibration()
            assert.equal(mockHardware.running1PointCalibration, true)
        })
        it('runs 2 point calibration', async() => {
            await device.connect()
            await device.run2PointCalibration()
            assert.equal(mockHardware.running2PointCalibration, true)
        })
        it('sets automatic gain control', async() => {
            await device.connect()
            await device.setAGC('full')
            assert.equal(mockHardware.agc, 0)
            const enabled = await device.getAGC()
            assert.equal(enabled, true)
        })
        it('sets ITT mode', async() => {
            await device.connect()
            await device.setITT('s-curve')
            assert.equal(mockHardware.itt, 3)
            const mode = await device.getITT()
            assert.equal(mode, 's-curve')
        })
        it('sets LUT mode', async() => {
            await device.connect()
            await device.setLUT('color')
            assert.equal(mockHardware.lut, 2)
            const mode = await device.getLUT()
            assert.equal(mode, 'color')
        })
        it('sets NUC mode', async() => {
            await device.connect()
            await device.setNUC('hot')
            assert.equal(mockHardware.nuc, 4)
            const mode = await device.getNUC()
            assert.equal(mode, 'hot')
        })
        it('toggles freeze frame', async() => {
            await device.connect()
            await device.toggleFreezeFrame()
            assert.equal(mockHardware.frozen, true)
        })
        it('toggles the cryo cooler', async() => {
            await device.connect()
            await device.setCooler(false)
            assert.equal(mockHardware.cooler, false)
            await device.setCooler(true)
            assert.equal(mockHardware.cooler, true)
        })
        it('toggles the on-screen display', async() => {
            await device.connect()
            await device.toggleOSD(false)
            assert.equal(mockHardware.osd, false)
        })
        it('toggles the color bar', async() => {
            await device.connect()
            await device.toggleColorBar(true)
            assert.equal(mockHardware.colorBar, true)
        })
        it('gets camera status', async() => {
            await device.connect()
            const status = await device.getStatus()
            assert.equal(status.numCoolerCycles, 22246)
            assert.equal(status.numPowerCycles, 22371)
            assert.equal(status.coolerTime, 1431779362)
        })
    })
    describe('Error Handling', () => {
        it('throws if no response is received in time', async() => {
            mockHardware.broken = true
            device.responseTimeout = 10
            await device.connect()
            await assert.rejects(() => device.toggleFreezeFrame(), /timeout/)
        })
        it('validates AGC options', async() => {
            await assert.rejects(() => device.setAGC('fake'), /Option "fake" is invalid. Available options are \["off", "full", "midsize", "center", "horizon"\]/i)
        })
        it('validates ITT options', () => {
            assert.throws(() => device.setITT('fake'), /Option "fake" is invalid. Available options are \["linear", "inverse", "s-curve", "two-cycle"\]/i)
        })
        it('validates NUC modes', () => {
            assert.throws(() => device.setNUC('fake'), /Option "fake" is invalid. Available options are \["cold", "mid", "warm", "hot"\]/i)
        })
        it('validates LUT modes', () => {
            assert.throws(() => device.setLUT('fake'), /Option "fake" is invalid. Available options are \["black-and-white", "color", "sepia"\]/i)
        })
    })
})

describe('Amber Radiance 1 (Serial Transport)', () => {
    beforeEach(async() => {
        // Start fake server
        mockHardware = new MockCamera()
        await mockHardware.listen(mockPort)
        // Start our client
        device = new Camera({ port: '/dev/ttyS0fake', transport: 'serial' })
    })

    afterEach(async() => {
        await device.close()
        await mockHardware.close()
    })

    describe('Basic Operation', () => {
        it('changes brightness', async() => {
            await device.connect()
            await device.setBrightness(-1)
            assert.equal(mockHardware.brightness, 99)
            await device.setBrightness(1)
            assert.equal(mockHardware.brightness, 100)
        })
        it('changes contrast', async() => {
            await device.connect()
            await device.setContrast(1)
            assert.equal(mockHardware.contrast, 101)
            await device.setContrast(-1)
            assert.equal(mockHardware.contrast, 100)
        })
    })
})
